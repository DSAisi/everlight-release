// Shared policy: keep edits and in-flight navigation intact, refresh only data views.
(()=>{
 const list=new Set(['/home','/overview','/libraries','/activities','/modules','/status','/audit','/tasks','/dreams','/notifications','/controls']);
 function eligible(path){return list.has(path)||/^\/(?:library|module|reviews|audit|tasks|dreams)\/[^/]+$/.test(path)||/^\/memory\/[^/]+\/[^/]+(?:\/versions)?$/.test(path);}
 function fingerprint(html){return String(html).replace(/后端真实读回 · \d{4}-\d\d-\d\dT[\d:.]+Z/g,'后端真实读回');}
 function protectedView(root,doc,dirty){return dirty||!!root.querySelector('[data-h6-key]:disabled, form button[type=submit]:disabled, [data-busy=true], [aria-busy=true]')||!!doc.querySelector('dialog[open], [role=dialog][aria-modal=true]')||!!(root.contains(doc.activeElement)&&doc.activeElement.matches('input,textarea,select,button,[contenteditable=true]'));}
 function runtime(path){return ['/controls'].includes(path);}
 window.EverlightLiveView={eligible,runtime,fingerprint,protectedView,intervalMs:3000};
})();
