const status=document.getElementById('status');
let permissionRequest=null;
function render(result){
 if(result.server)document.getElementById('server').value=result.server+'/';
 permissionRequest=result.permissionRequest;
 const grant=document.getElementById('grant');grant.hidden=!permissionRequest;
 const sites=permissionRequest?.origins?.join('\n')||'';
 const tabs=permissionRequest?.permissions?.includes('tabs')?'\n需要标签页地址读取权限，用于识别本次 DOI 跳转；Chrome 会显示权限说明。':'';
 document.getElementById('permission-info').textContent=permissionRequest?(result.permissionReason||'需要站点授权')+'\n'+sites+tabs:'';
 status.textContent=(result.connected?'已配对':'尚未配对')+(result.title?'\n当前论文：'+result.title:'\n当前无下载任务')+(result.lastError?'\n提示：'+result.lastError:'');
}
async function action(name){
 const button=document.getElementById(name);if(button)button.disabled=true;
 try{
  const result=await chrome.runtime.sendMessage({action:name,server:document.getElementById('server').value,code:document.getElementById('code').value});
  if(!result?.ok)throw Error(result?.error||'助手未响应');
  if(name==='pair')document.getElementById('code').value='';render(result);
 }catch(error){status.textContent=error.message;}finally{if(button)button.disabled=false;}
}
for(const name of ['pair','check','open'])document.getElementById(name).addEventListener('click',()=>action(name));
document.getElementById('grant').addEventListener('click',()=>{
 if(!permissionRequest)return;
 // Must run directly in the click gesture, not after an async message round trip.
 const request={...(permissionRequest.origins?{origins:permissionRequest.origins}:{}),...(permissionRequest.permissions?{permissions:permissionRequest.permissions}:{})};
 chrome.permissions.request(request).then(granted=>{
  if(granted)return action('check');
  status.textContent='未获得权限，任务保持暂停；可改用出版社的直接链接，或取消任务。';
 }).catch(error=>{status.textContent=error.message;});
});
action('status');
