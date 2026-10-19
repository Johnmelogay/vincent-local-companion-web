'use strict';
const $=id=>document.getElementById(id);
const STORAGE='vincent-web-chat-v1';
let ownerToken=localStorage.getItem('vincent-owner-key')||'';
const pairing=new URLSearchParams(location.hash.slice(1)).get('owner');
if(pairing){ownerToken=pairing;localStorage.setItem('vincent-owner-key',ownerToken);window.history.replaceState(null,'',location.pathname);}
let archiveBefore=null,archiveLoading=false,taskRunning=false,taskReviewOpen=false;
const storageKey=()=>ownerToken?'vincent-owner-history-cache':STORAGE;
const DISCOVERY='https://raw.githubusercontent.com/Johnmelogay/vincent-local-companion-web/main/runtime.json';
let api='',socket=null,busy=false,attachments=[],history=[],mic=null,capture=null,processor=null;
let speaking=false,speech=[],silence=0,voiced=0,barge=0,preRoll=[],audioContext=null,playAt=0,sources=new Set(),decode=Promise.resolve(),audioEpoch=0;
try{history=JSON.parse(localStorage.getItem(storageKey())||'[]').slice(ownerToken?-200:-20);}catch{history=[];}
let activityStarted=0;
function activity(text){const active=busy||taskRunning;$('activity-text').textContent=text;$('stop').hidden=!active;$('activity').dataset.busy=String(active);if(active&&!activityStarted)activityStarted=Date.now();if(!active)activityStarted=0;}
const elapsedLabel=document.createElement('small');elapsedLabel.id='task-elapsed';$('activity').append(elapsedLabel);
setInterval(()=>{elapsedLabel.textContent=activityStarted?Math.floor((Date.now()-activityStarted)/1000)+'s elapsed':'';},1000);
function save(){try{localStorage.setItem(storageKey(),JSON.stringify(history.slice(ownerToken?-200:-20)));}catch{}}
function renderMessage(role,text){
 $('welcome')?.remove();const row=document.createElement('article');row.className='message '+role;
 if(role==='assistant'){const label=document.createElement('div');label.className='message-label';label.textContent='VINCENT';row.append(label);}
 const chunks=text.split(/(```[\s\S]*?(?:```|$))/g);
 for(const chunk of chunks){if(!chunk)continue;if(chunk.startsWith('```')){const pre=document.createElement('pre');const content=chunk.replace(/^```[^\n]*\n?/,'').replace(/```$/,'');const copy=document.createElement('button');copy.className='copy-code';copy.textContent='Copy code';copy.onclick=()=>navigator.clipboard.writeText(content).then(()=>copy.textContent='Copied');pre.append(copy,document.createTextNode(content));row.append(pre);}else{const body=document.createElement('div');body.className='message-body';body.textContent=chunk;row.append(body);}}
 $('messages').append(row);$('messages').scrollTop=$('messages').scrollHeight;return row;
}
history.forEach(m=>renderMessage(m.role,m.content));
async function discover(){
 try{if(location.hostname==='127.0.0.1'||location.hostname==='localhost'||location.hostname.endsWith('.trycloudflare.com'))api=location.origin;else{const r=await fetch(DISCOVERY+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('Waiting for the Mac');const d=await r.json();if(!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(d.api))throw Error('Waiting for the Mac');api=d.api;}
 const status=await fetch(api+'/status',{signal:AbortSignal.timeout(6000)}).then(r=>r.json());if(!status.online)throw Error('Mac offline or preparing');
 $('connection-label').textContent=status.busy?'Mac online · answering':'Mac connected';$('connection-dot').classList.add('online');$('api-address').value=api+'/v1';
 if(!busy&&$('activity-text').textContent.startsWith('Waiting'))activity(mic?'Listening…':'');
 if(ownerToken&&!busy)await syncOwnerHistory();
 }catch(error){$('connection-label').textContent='Mac offline or preparing';$('connection-dot').classList.remove('online');if(!busy)activity('Waiting for your Mac to come online…');}
}
discover();setInterval(discover,30000);
async function syncOwnerHistory(older=false){
 if(!ownerToken||!api||archiveLoading||busy||taskRunning||taskReviewOpen)return;
 archiveLoading=true;
 try{
  const path=api+'/api/history?limit=200'+(older&&archiveBefore?'&before='+archiveBefore:'');
  const response=await fetch(path,{headers:{Authorization:'Bearer '+ownerToken},cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error(data.detail||'Could not sync personal history.');
  const messages=data.messages.map(m=>({role:m.role,content:m.content}));
  history=older?[...messages,...history]:messages;
  if(data.messages.length)archiveBefore=data.messages[0].id;
  $('messages').replaceChildren();history.forEach(m=>renderMessage(m.role,m.content));if(taskPanel)$('messages').append(taskPanel);save();
  $('older-history').hidden=!data.has_more;
  $('personal-history-status').textContent=`Personal history connected · ${data.total} messages saved on your Mac. Desktop and web share this history.`;
  $('export-history').hidden=false;$('disconnect-history').hidden=false;
  $('composer-note').textContent='Personal history synced with your Mac · Complete transcript retained locally · Recent and relevant context used for replies';
  $('new-chat').title='Refresh shared history';const label=$('new-chat').querySelector('span');if(label)label.textContent='Refresh history';
 }catch(error){activity(error.message);}finally{archiveLoading=false;}
}
$('older-history').onclick=()=>syncOwnerHistory(true);
$('export-history').onclick=async()=>{
 try{const response=await fetch(api+'/api/history/export',{headers:{Authorization:'Bearer '+ownerToken}});if(!response.ok)throw Error('Could not export history.');const blob=await response.blob();const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='vincent-history.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}catch(error){activity(error.message);}
};
$('disconnect-history').onclick=()=>{localStorage.removeItem('vincent-owner-key');localStorage.removeItem('vincent-owner-history-cache');location.reload();};
setInterval(()=>{if(ownerToken&&!busy)syncOwnerHistory();},15000);
function stopAudio(){audioEpoch++;for(const source of sources){try{source.stop();}catch{}}sources.clear();playAt=0;decode=Promise.resolve();}
function stop(){if(socket){socket.close();socket=null;}stopAudio();busy=false;if((taskRunning||taskReviewOpen)&&ownerToken&&api)fetch(api+'/api/agent/stop',{method:'POST',headers:{Authorization:'Bearer '+ownerToken}}).catch(()=>{});taskRunning=false;taskReviewOpen=false;activity(mic?'Listening…':'');}
function audio(data){const epoch=audioEpoch;decode=decode.then(async()=>{if(epoch!==audioEpoch)return;if(!audioContext)audioContext=new AudioContext({sampleRate:24000});await audioContext.resume();const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));const buffer=await audioContext.decodeAudioData(bytes.buffer);if(epoch!==audioEpoch)return;const source=audioContext.createBufferSource();source.buffer=buffer;source.connect(audioContext.destination);source.onended=()=>{sources.delete(source);if(!sources.size&&!busy)activity(mic?'Listening…':'');};playAt=Math.max(playAt,audioContext.currentTime+.18);sources.add(source);source.start(playAt);playAt+=buffer.duration;}).catch(()=>activity('Audio could not play. Tap Voice replies and try again.'));}
function documentContext(query){
 const words=new Set(query.toLowerCase().match(/\w{3,}/g)||[]);let chunks=[];
 for(const file of attachments){for(let offset=0;offset<file.text.length;offset+=1100){const text=file.text.slice(offset,offset+1200);const score=[...words].filter(word=>text.toLowerCase().includes(word)).length;chunks.push({name:file.filename,text,score,offset});}}
 chunks.sort((a,b)=>b.score-a.score||a.offset-b.offset);return chunks.slice(0,9).map(c=>`FILE: ${c.name} (excerpt at character ${c.offset})\n${c.text}`).join('\n\n').slice(0,14000);
}
function send(message,audioData=null){
 if(!api){activity('Your Mac is not connected yet.');return;}if(busy)stop();
 const prior=history.slice(-12);let userAdded=false,done=false;
 if(message){history.push({role:'user',content:message});renderMessage('user',message);userAdded=true;save();}
 busy=true;activity(audioData?'Transcribing…':$('reasoning').checked?'Checking the question carefully…':'Thinking…');
 const current=new WebSocket(api.replace(/^http/,'ws')+'/ws');socket=current;
 current.onopen=()=>current.send(JSON.stringify({message:message||'',history:prior,context:documentContext(message||'Summarize the document'),reasoning:$('reasoning').checked,voice:$('speak').checked,audio_base64:audioData,owner_token:ownerToken||undefined}));
 current.onmessage=event=>{if(socket!==current)return;const msg=JSON.parse(event.data);
 if(msg.type==='stage')activity({transcribing:'Transcribing…',thinking:$('reasoning').checked?'Checking the question carefully…':'Thinking…',speaking:'Preparing voice…'}[msg.stage]||'Working…');
 if(msg.type==='progress')showProgress(msg.message||msg.stage);
 if(msg.type==='agent_actions')renderActions(msg.actions||[]);
 if(msg.type==='transcript'&&!userAdded&&msg.text){history.push({role:'user',content:msg.text});renderMessage('user',msg.text);userAdded=true;save();}
 if(msg.type==='text'){history.push({role:'assistant',content:msg.text});renderMessage('assistant',msg.text);save();activity($('speak').checked?'Preparing voice…':'');}
 if(msg.type==='audio'){activity('Speaking · you can interrupt');audio(msg.audio_base64);}
 if(msg.type==='done'){done=true;busy=false;activity(sources.size?'Speaking…':mic?'Listening…':'');}
 if(msg.type==='error'){done=true;busy=false;activity(msg.message||'The request could not finish.');}
 };
 current.onerror=()=>{if(socket===current){busy=false;activity('Connection interrupted. Check that your Mac is online.');}};
 current.onclose=()=>{if(socket===current){socket=null;busy=false;if(!done)activity('Connection closed. You can try again.');else activity(sources.size?'Speaking…':mic?'Listening…':'');}};
}
let taskCursor=0,taskPanel=null;
function showProgress(text){
 if(!taskPanel){taskPanel=document.createElement('details');taskPanel.className='message assistant task-activity';taskPanel.open=true;const title=document.createElement('summary');title.textContent='Activity · plans, actions, checks';taskPanel.append(title);$('messages').append(taskPanel);}
 const line=document.createElement('p');line.textContent=text;taskPanel.append(line);while(taskPanel.children.length>60)taskPanel.children[1].remove();
}
function renderActions(actions){
 if(actions.length)taskReviewOpen=true;
 for(const action of actions){const card=document.createElement('article');card.className='message assistant';const title=document.createElement('strong');title.textContent=action.tool.replaceAll('_',' ')+' '+(action.path||'')+(action.scope==='machine'?' · MACHINE ACCESS':' · workspace');const preview=document.createElement('pre');preview.textContent=action.command||action.content||action.path||'';const status=document.createElement('p');const yes=document.createElement('button'),no=document.createElement('button');yes.textContent='Approve';no.textContent='Reject';
 const automatic=document.createElement('button');automatic.textContent='Approve workspace task';automatic.hidden=action.scope!=='workspace';
 const decide=async(approve,approveTask=false)=>{yes.disabled=no.disabled=automatic.disabled=true;taskRunning=approve;activity(approve?'Running and checking…':'Cancelling…');status.textContent=approve?'Running and checking…':'Cancelling…';try{const response=await fetch(api+'/api/agent/actions/'+encodeURIComponent(action.id),{method:'POST',headers:{Authorization:'Bearer '+ownerToken,'Content-Type':'application/json'},body:JSON.stringify({approve,approve_task:approveTask})});const result=await response.json();if(!response.ok){if(response.status===409||result.detail?.includes('displayed order'))yes.disabled=no.disabled=automatic.disabled=false;throw Error(result.detail||'Action failed.');}status.textContent=JSON.stringify(result,null,2);taskReviewOpen=result.task_state==='awaiting_approval';if(result.actions?.length)renderActions(result.actions);}catch(error){status.textContent=error.message;}finally{taskRunning=false;activity(status.textContent.includes('failed')?'Task needs attention.':'Review task results in Activity.');}};
 yes.onclick=()=>decide(true);no.onclick=()=>decide(false);automatic.onclick=()=>decide(true,true);card.append(title,preview,yes,no,automatic,status);$('messages').append(card);}
}
setInterval(async()=>{if(!ownerToken||!api||document.hidden)return;try{const response=await fetch(api+'/api/agent/events?after='+taskCursor,{headers:{Authorization:'Bearer '+ownerToken}});if(!response.ok)return;const data=await response.json();for(const event of data.events){taskCursor=Math.max(taskCursor,event.id);showProgress(event.stage+' · '+(event.detail.message||JSON.stringify(event.detail.result||event.detail)));if(event.stage==='review')activity('Waiting for your review below');else if(['complete','failed','cancelled','paused','interrupted'].includes(event.stage))activity(event.detail.message);else activity(event.detail.message||'Working on your task…');}}catch{}},2000);

$('composer').onsubmit=event=>{event.preventDefault();const text=$('message').value.trim();if(!text)return;$('message').value='';$('message').style.height='auto';send(text);};
$('message').oninput=()=>{$('message').style.height='auto';$('message').style.height=Math.min(200,$('message').scrollHeight)+'px';};
$('message').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('composer').requestSubmit();}};
$('stop').onclick=stop;
$('new-chat').onclick=()=>{if(ownerToken){stop();syncOwnerHistory();return;}stop();history=[];save();location.reload();};
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='k'){event.preventDefault();$('new-chat').click();}});
document.querySelectorAll('[data-prompt]').forEach(button=>button.onclick=()=>send(button.dataset.prompt));
$('api-info').onclick=()=>$('connection-dialog').showModal();$('close-dialog').onclick=()=>$('connection-dialog').close();
$('model-label').onclick=()=>$('connection-dialog').showModal();
$('copy-api').onclick=()=>navigator.clipboard.writeText($('api-address').value).then(()=>$('copy-api').textContent='Copied');
$('attach').onclick=()=>$('file').click();
if($('suggest-upload'))$('suggest-upload').onclick=()=>$('file').click();
function renderAttachments(){
 $('attachment-list').replaceChildren();for(const file of attachments){const chip=document.createElement('span');chip.className='attachment-chip';chip.textContent=file.filename+(file.truncated?' · excerpt':'');const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Remove '+file.filename);remove.onclick=()=>{attachments=attachments.filter(item=>item!==file);renderAttachments();};chip.append(remove);$('attachment-list').append(chip);}
}
$('file').onchange=async()=>{for(const file of $('file').files){if(attachments.length>=3){activity('Attach up to three documents at a time.');break;}if(file.size>5*1024**2){activity('Files must be under 5 MB.');continue;}if(!api){activity('Wait for your Mac to connect before uploading.');break;}activity('Reading '+file.name+'…');try{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const response=await fetch(api+'/api/files/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,content_base64:btoa(binary)})});const data=await response.json();if(!response.ok)throw Error(data.detail||'The document could not be read.');attachments.push(data);renderAttachments();activity('Document ready. Ask a question about it.');}catch(error){activity(error.message);}}$('file').value='';};
function wav(samples){const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);const put=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};put(0,'RIFF');view.setUint32(4,36+samples.length*2,true);put(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,'data');view.setUint32(40,samples.length*2,true);for(let i=0;i<samples.length;i++)view.setInt16(44+i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
async function stopMic(){if(processor){processor.disconnect();processor=null;}if(mic){mic.getTracks().forEach(track=>track.stop());mic=null;}if(capture){await capture.close();capture=null;}speaking=false;speech=[];preRoll=[];$('microphone').classList.remove('recording');$('microphone').setAttribute('aria-label','Start voice mode');activity('Voice mode off');}
$('microphone').onclick=async()=>{
 if(mic){await stopMic();return;}try{
 mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
 capture=new AudioContext({sampleRate:16000});await capture.resume();const source=capture.createMediaStreamSource(mic);processor=capture.createScriptProcessor(2048,1,1);source.connect(processor);processor.connect(capture.destination);$('speak').checked=true;$('microphone').classList.add('recording');$('microphone').setAttribute('aria-label','Stop voice mode');activity('Listening…');
 processor.onaudioprocess=event=>{event.outputBuffer.getChannelData(0).fill(0);const data=event.inputBuffer.getChannelData(0);let sum=0;for(const sample of data)sum+=sample*sample;const rms=Math.sqrt(sum/data.length);
 if(busy||sources.size){if(rms>.025)barge++;else barge=0;if(barge<2)return;stop();barge=0;speaking=false;speech=[];}
 if(!speaking){preRoll.push(...data);preRoll=preRoll.slice(-3200);if(rms<.008)return;speaking=true;speech=preRoll.slice();preRoll=[];voiced=0;silence=0;activity('Listening · keep speaking');}else speech.push(...data);
 if(rms>.008){silence=0;voiced+=data.length;}else silence+=data.length;
 if(silence>14400||speech.length>=16000*50){if(voiced>1600)send('',wav(speech));speaking=false;speech=[];silence=0;}
 };
 }catch(error){await stopMic();activity('Microphone: '+error.message);}
};
window.addEventListener('pagehide',()=>{stop();if(mic)mic.getTracks().forEach(track=>track.stop());});
