(function(root){
 function describe(event){const detail=event.detail||{},result=detail.result;
  if(detail.message)return detail.message+(detail.output?' · '+detail.output.trim().slice(-160):'');
  if(!result)return event.stage;
  if(result.status==='failed')return result.error||'The action needs attention.';
  if(result.status==='rejected')return 'Action rejected.';
  if(result.tool==='write_file')return 'Saved '+(result.relative_path||result.path)+' · '+(result.verified?'readback verified':result.bytes+' bytes');
  if(result.tool==='run_command')return 'Command exited '+result.exit_code+(result.timed_out?' · time limit reached':'')+(result.output?' · '+result.output.trim().slice(0,180):'');
  if(result.tool==='search_web')return 'Found '+(result.results?.length||0)+' web sources.';
  if(result.tool==='fetch_page')return 'Read '+result.url;
  if(result.tool==='search_files')return 'Found '+(result.paths?.length||0)+' matching paths using '+result.engine+'.';
  if(result.tool==='read_file')return 'Read '+result.path;
  if(result.tool==='list_files')return 'Listed '+(result.files?.length||0)+' items.';
  return 'Tool result received.';
 }
 const api={describe};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VincentActivity=api;
})(typeof window!=='undefined'?window:this);
