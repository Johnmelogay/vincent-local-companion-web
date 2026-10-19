(function(root){
 'use strict';
 function same(a,b){return a.role===b.role&&a.content===b.content;}
 function reconcile(existing,incoming,total){
  if(total===0)return [];
  const known=existing.filter(item=>item.id);
  const keep=total<known.length?[]:known;
  const byId=new Map([...keep,...incoming].map(item=>[item.id,item]));
  const counts=new Map();for(const item of incoming){const key=item.role+'\0'+item.content;counts.set(key,(counts.get(key)||0)+1);}
  const pending=[];
  for(const item of [...existing].reverse())if(!item.id){const key=item.role+'\0'+item.content;if(counts.get(key)>0)counts.set(key,counts.get(key)-1);else pending.unshift(item);}
  return [...byId.values()].sort((a,b)=>a.id-b.id).concat(pending);
 }
 function unchanged(a,b){return a.length===b.length&&a.every((item,index)=>same(item,b[index]));}
 function appends(a,b){return a.length<=b.length&&a.every((item,index)=>same(item,b[index]));}
 const api={reconcile,unchanged,appends};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VincentHistory=api;
})(typeof window!=='undefined'?window:this);
