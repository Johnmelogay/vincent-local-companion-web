'use strict';
const $=id=>document.getElementById(id);
const STORAGE='vincent-web-chat-v1';
const DISCOVERY='https://raw.githubusercontent.com/Johnmelogay/vincent-local-companion-web/main/runtime.json';
let api='',socket=null,busy=false,attachments=[],history=[],mic=null,capture=null,processor=null;
let speaking=false,speech=[],silence=0,voiced=0,barge=0,preRoll=[],audioContext=null,playAt=0,sources=new Set(),decode=Promise.resolve(),audioEpoch=0;
try{history=JSON.parse(localStorage.getItem(STORAGE)||'[]').slice(-20);}catch{history=[];}
function activity(text){$('activity-text').textContent=text;$('stop').hidden=!busy;}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(history.slice(-20)));}catch{}}
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
 }catch(error){$('connection-label').textContent='Mac offline or preparing';$('connection-dot').classList.remove('online');if(!busy)activity('Waiting for your Mac to come online…');}
}
discover();setInterval(discover,30000);
function stopAudio(){audioEpoch++;for(const source of sources){try{source.stop();}catch{}}sources.clear();playAt=0;decode=Promise.resolve();}
function stop(){if(socket){socket.close();socket=null;}stopAudio();busy=false;activity(mic?'Listening…':'');}
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
 current.onopen=()=>current.send(JSON.stringify({message:message||'',history:prior,context:documentContext(message||'Summarize the document'),reasoning:$('reasoning').checked,voice:$('speak').checked,audio_base64:audioData}));
 current.onmessage=event=>{if(socket!==current)return;const msg=JSON.parse(event.data);
 if(msg.type==='stage')activity({transcribing:'Transcribing…',thinking:$('reasoning').checked?'Checking the question carefully…':'Thinking…',speaking:'Preparing voice…'}[msg.stage]||'Working…');
 if(msg.type==='transcript'&&!userAdded&&msg.text){history.push({role:'user',content:msg.text});renderMessage('user',msg.text);userAdded=true;save();}
 if(msg.type==='text'){history.push({role:'assistant',content:msg.text});renderMessage('assistant',msg.text);save();activity($('speak').checked?'Preparing voice…':'');}
 if(msg.type==='audio'){activity('Speaking · you can interrupt');audio(msg.audio_base64);}
 if(msg.type==='done'){done=true;busy=false;activity(sources.size?'Speaking…':mic?'Listening…':'');}
 if(msg.type==='error'){done=true;busy=false;activity(msg.message||'The request could not finish.');}
 };
 current.onerror=()=>{if(socket===current){busy=false;activity('Connection interrupted. Check that your Mac is online.');}};
 current.onclose=()=>{if(socket===current){socket=null;busy=false;if(!done)activity('Connection closed. You can try again.');else activity(sources.size?'Speaking…':mic?'Listening…':'');}};
}
$('composer').onsubmit=event=>{event.preventDefault();const text=$('message').value.trim();if(!text)return;$('message').value='';$('message').style.height='auto';send(text);};
$('message').oninput=()=>{$('message').style.height='auto';$('message').style.height=Math.min(200,$('message').scrollHeight)+'px';};
$('message').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('composer').requestSubmit();}};
$('stop').onclick=stop;
$('new-chat').onclick=()=>{stop();history=[];save();location.reload();};
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
