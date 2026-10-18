const $=s=>document.querySelector(s),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove("on"),3200)};
const bwp=n=>"P"+Number(n).toLocaleString("en-US");
const q=async p=>{const r=await p;if(r.error){toast(r.error.message);throw r.error}return r.data};
let ME,LOC=[],TYPES=[],FAV=new Set(),PUB={},ATL={},LST=[],F={loc:"",type:"",max:"",saved:false};
const lname=id=>{const l=LOC.find(x=>x.location_id===id);return l?l.area+", "+l.city:""};
const tname=id=>(TYPES.find(x=>x.type_id===id)||{}).name||"";
const fmt=d=>new Date(d).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});
const safe=n=>n.replace(/[^\w.-]/g,"_");
const TAG={available:"ok",approved:"ok",verified:"ok",accepted:"ok",rented:"bad",rejected:"bad",declined:"bad",cancelled:"bad"};
const tag=s=>`<span class="tag ${TAG[s]||"warn"}">${esc(s[0].toUpperCase()+s.slice(1))}</span>`;
const lopts=v=>LOC.map(l=>`<option value="${l.location_id}"${String(v)===String(l.location_id)?" selected":""}>${esc(l.area+", "+l.city)}</option>`).join("");
const topts=v=>TYPES.map(t=>`<option value="${t.type_id}"${String(v)===String(t.type_id)?" selected":""}>${esc(t.name)}</option>`).join("");
const reason=()=>{const r=prompt("Reason for rejection (the provider will see this):");return r===null?null:r.trim()||"No reason given."};
const okFile=f=>f&&f.size<=5e6&&/\.(pdf|jpe?g|png)$/i.test(f.name);
const modal=h=>{$("#dlg").innerHTML=h;$("#dlg").showModal()};

const card=l=>`<article class="card"><div class="ph" style="background:#2a6aa8">${esc(tname(l.type_id))} · ${l.bedrooms} bed</div><div class="cb"><h3>${esc(l.title)}</h3><div class="rent">${bwp(l.monthly_rent)} <span class="muted">/ month</span></div><div class="muted">${esc(lname(l.location_id))}</div><div class="row"><span class="tag ok">✓ Verified provider</span>${tag(l.availability_status)}</div><div class="sp"><button class="btn" data-a="open" data-id="${l.property_id}">View details</button><button class="btn alt" data-a="fav" data-id="${l.property_id}">${FAV.has(l.property_id)?"Saved":"Save"}</button></div></div></article>`;

async function tenant(){
 let r=sb.from("properties").select("*").eq("listing_status","approved").eq("availability_status","available").order("created_at",{ascending:false});
 if(F.loc)r=r.eq("location_id",F.loc);if(F.type)r=r.eq("type_id",F.type);if(F.max)r=r.lte("monthly_rent",F.max);
 const[L,fav,pv,vr]=await Promise.all([q(r),q(sb.from("favorites").select("property_id")),q(sb.from("provider_public").select("*")),q(sb.from("viewing_requests").select("*, properties(title)").order("created_at",{ascending:false}))]);
 FAV=new Set(fav.map(x=>x.property_id));PUB=Object.fromEntries(pv.map(x=>[x.user_id,x.name]));LST=L;
 const list=F.saved?L.filter(l=>FAV.has(l.property_id)):L;
 return `<section class="hero"><h1>Find a rental you can trust.</h1><p>Every listing comes from a verified provider and has been approved by an administrator. Rented homes are hidden.</p></section>
 <div class="filters"><div><label for="fl">Location</label><select id="fl"><option value="">Anywhere</option>${lopts(F.loc)}</select></div>
 <div><label for="ft">Property type</label><select id="ft"><option value="">Any</option>${topts(F.type)}</select></div>
 <div><label for="fm">Max rent (P per month)</label><input id="fm" type="number" min="0" step="100" value="${esc(F.max)}"></div>
 <div><label for="fs">Show</label><select id="fs"><option value="">All listings</option><option value="1"${F.saved?" selected":""}>Saved only</option></select></div></div>
 ${list.length?`<div class="grid">${list.map(card).join("")}</div>`:`<div class="empty">No listings match. Widen the price range or choose another location.</div>`}
 <div class="panel" style="margin-top:24px"><h2>My viewing requests</h2>${vr.length?vr.map(v=>`<div class="item"><div><strong>${esc(v.properties?.title||"Listing no longer available")}</strong><div class="muted">${fmt(v.preferred_at)}</div></div>${tag(v.status)}</div>`).join(""):`<p class="muted">You haven’t requested a viewing yet.</p>`}</div>`}

async function provider(){
 const[P,L,V,docs]=await Promise.all([q(sb.from("providers").select("*").eq("user_id",ME.id).single()),q(sb.from("properties").select("*").eq("provider_id",ME.id).order("created_at",{ascending:false})),q(sb.from("viewing_requests").select("*, properties(title)").order("created_at",{ascending:false})),q(sb.from("verification_records").select("*").eq("provider_id",ME.id).eq("doc_type","identity").order("submitted_at",{ascending:false}).limit(1))]);
 const ids=L.map(l=>l.property_id),log=ids.length?await q(sb.from("availability_updates").select("*").in("property_id",ids).order("created_at",{ascending:false})):[];
 const vs=P.verification_status,d=docs[0];
 return `<section class="hero"><h1>Manage your listings.</h1><p>Keep availability current so tenants only enquire about homes you can still let.</p></section>
 <div class="panel"><div class="row"><strong>Identity verification</strong>${tag(vs)}</div>
 ${vs==="verified"?`<button class="btn" data-a="new" style="margin-top:10px">Add a listing</button>`:vs==="pending"?`<p class="muted">Your document is with an administrator for review.</p>`
 :`${vs==="rejected"&&d?`<p class="muted">Rejected: ${esc(d.review_notes||"")}. Please upload a clearer document.</p>`:""}<div class="f"><div><label for="idf">Identity document (PDF, JPG or PNG, up to 5 MB)</label><input id="idf" type="file" accept=".pdf,.jpg,.jpeg,.png"></div><button class="btn" data-a="idup">Submit for verification</button></div>`}</div>
 <div class="panel"><h2>Your listings</h2>${L.length?L.map(l=>{const g=log.find(x=>x.property_id===l.property_id);return `<div class="item"><div><strong>${esc(l.title)}</strong><div class="muted">${esc(lname(l.location_id))} · ${bwp(l.monthly_rent)} / month</div><div class="row" style="margin-top:4px">${tag(l.listing_status)}${tag(l.availability_status)}</div>${l.listing_status==="rejected"?`<div class="muted">Reason: ${esc(l.admin_notes||"")}</div>`:""}${g?`<div class="muted">Last change: ${g.old_status} → ${g.new_status}, ${fmt(g.created_at)}</div>`:""}</div>
 ${l.listing_status==="approved"?`<div><label for="av${l.property_id}">Availability</label><select id="av${l.property_id}" data-a="av" data-id="${l.property_id}">${["available","rented","unavailable"].map(a=>`<option${a===l.availability_status?" selected":""}>${a}</option>`).join("")}</select></div>`:""}</div>`}).join(""):`<p class="muted">No listings yet.</p>`}</div>
 <div class="panel"><h2>Viewing requests</h2>${V.length?V.map(v=>`<div class="item"><div><strong>${esc(v.properties?.title)}</strong><div class="muted">${fmt(v.preferred_at)}</div><div>${esc(v.message||"")}</div></div>${v.status==="pending"?`<div class="row"><button class="btn" data-a="vr" data-id="${v.request_id}" data-v="accepted">Accept</button><button class="btn alt" data-a="vr" data-id="${v.request_id}" data-v="declined">Decline</button></div>`:tag(v.status)}</div>`).join(""):`<p class="muted">No requests yet.</p>`}</div>`}

async function admin(){
 const[iv,pl,at]=await Promise.all([q(sb.from("verification_records").select("*, providers(business_name, users(full_name,email))").eq("doc_type","identity").eq("status","pending")),q(sb.from("properties").select("*, providers(users(full_name))").eq("listing_status","pending")),q(sb.from("verification_records").select("*").eq("doc_type","authority_to_let").eq("status","pending"))]);
 ATL=Object.fromEntries(at.map(x=>[x.property_id,x]));
 return `<section class="hero"><h1>Review and approve.</h1><p>Nothing goes public until a verified provider’s listing is approved here.</p></section>
 <div class="panel"><h2>Provider verification (${iv.length})</h2>${iv.length?iv.map(v=>`<div class="item"><div><strong>${esc(v.providers.business_name||v.providers.users.full_name)}</strong><div class="muted">${esc(v.providers.users.email)} · ${fmt(v.submitted_at)}</div></div><div class="row"><button class="btn alt" data-a="doc" data-path="${esc(v.file_path)}">View document</button><button class="btn" data-a="vok" data-id="${v.verification_id}">Approve</button><button class="btn red" data-a="vno" data-id="${v.verification_id}">Reject</button></div></div>`).join(""):`<p class="muted">Nothing to review.</p>`}</div>
 <div class="panel"><h2>Listing approval (${pl.length})</h2>${pl.length?pl.map(l=>`<div class="item"><div><strong>${esc(l.title)}</strong><div class="muted">${esc(l.providers.users.full_name)} · ${esc(lname(l.location_id))} · ${bwp(l.monthly_rent)}</div></div><div class="row">${ATL[l.property_id]?`<button class="btn alt" data-a="doc" data-path="${esc(ATL[l.property_id].file_path)}">View authority-to-let</button>`:`<span class="muted">No document</span>`}<button class="btn" data-a="lok" data-id="${l.property_id}">Approve</button><button class="btn red" data-a="lno" data-id="${l.property_id}">Reject</button></div></div>`).join(""):`<p class="muted">Nothing to review.</p>`}</div>`}

async function notes(){
 const n=await q(sb.from("notifications").select("*").eq("user_id",ME.id).order("created_at",{ascending:false}).limit(5));
 return `<div class="panel"><h2>Notifications</h2>${n.length?n.map(x=>`<div class="item"><span${x.is_read?' class="muted"':""}>${esc(x.message)}</span>${x.is_read?"":`<button class="btn alt" data-a="read" data-id="${x.notification_id}">Mark read</button>`}</div>`).join(""):`<p class="muted">Nothing new.</p>`}</div>`}

async function render(){
 $("#who").innerHTML=`<span>${esc(ME.full_name||ME.email)} (${ME.role})</span><button class="btn alt" data-a="out" style="color:#fff;border-color:#fff6">Log out</button>`;
 try{$("#app").innerHTML=(await{tenant,provider,admin}[ME.role]())+(await notes())}
 catch(e){console.error(e);$("#app").innerHTML=`<div class="empty">Something went wrong loading this page. Check your connection and refresh.</div>`}}

function detail(id){
 const l=LST.find(x=>x.property_id===id);
 modal(`<h2>${esc(l.title)}</h2><div class="rent">${bwp(l.monthly_rent)} <span class="muted">/ month</span></div><p class="muted">${esc(lname(l.location_id))} · ${esc(tname(l.type_id))} · ${l.bedrooms} bedroom${l.bedrooms===1?"":"s"}</p>
 <div class="row"><span class="tag ok">✓ ${esc(PUB[l.provider_id]||"Verified provider")}</span>${tag(l.availability_status)}</div><p>${esc(l.description||"")}</p><p><strong>Amenities:</strong> ${esc(l.amenities||"Not listed")}</p>
 <div class="f"><div><label for="vd">Preferred date and time</label><input id="vd" type="datetime-local"></div><div><label for="vm">Message to provider</label><textarea id="vm" rows="3"></textarea></div></div>
 <div class="row" style="margin-top:14px"><button class="btn" data-a="send" data-id="${id}">Request viewing</button><button class="btn alt" data-a="close">Close</button></div>`)}
function newForm(){
 modal(`<h2>Add a listing</h2><div class="f"><div><label for="nt">Title</label><input id="nt" maxlength="120"></div><div><label for="nl">Location</label><select id="nl">${lopts()}</select></div><div><label for="ny">Property type</label><select id="ny">${topts()}</select></div>
 <div><label for="nb">Bedrooms</label><input id="nb" type="number" min="0" value="1"></div><div><label for="nr">Monthly rent (P)</label><input id="nr" type="number" min="1"></div><div><label for="nm">Amenities</label><input id="nm"></div><div><label for="nd">Description</label><textarea id="nd" rows="3"></textarea></div>
 <div><label for="na">Authority-to-let document (PDF, JPG or PNG, up to 5 MB)</label><input id="na" type="file" accept=".pdf,.jpg,.jpeg,.png"></div></div>
 <div class="row" style="margin-top:14px"><button class="btn" data-a="add">Submit for approval</button><button class="btn alt" data-a="close">Cancel</button></div>`)}

async function act(b){
 const a=b.dataset.a,id=+b.dataset.id,v=b.dataset.v,docs=()=>sb.storage.from("verification-docs");
 if(a==="out")return A.out();
 if(a==="close")return $("#dlg").close();
 if(a==="open")return detail(id);
 if(a==="new")return newForm();
 if(a==="doc"){const w=window.open("","_blank");const{data,error}=await docs().createSignedUrl(b.dataset.path,300);if(error){if(w)w.close();return toast(error.message)}if(w)w.location=data.signedUrl;return}
 if(a==="fav")await q(FAV.has(id)?sb.from("favorites").delete().eq("tenant_id",ME.id).eq("property_id",id):sb.from("favorites").insert({tenant_id:ME.id,property_id:id}));
 else if(a==="send"){const d=$("#vd").value;if(!d)return toast("Choose a preferred date and time.");
  await q(sb.from("viewing_requests").insert({property_id:id,tenant_id:ME.id,preferred_at:new Date(d).toISOString(),message:$("#vm").value.trim()||null}));$("#dlg").close();toast("Viewing requested. The provider has been notified.")}
 else if(a==="idup"){const f=$("#idf").files[0];if(!okFile(f))return toast("Choose a PDF, JPG or PNG file up to 5 MB.");
  const path=`${ME.id}/identity-${Date.now()}-${safe(f.name)}`;await q(docs().upload(path,f));
  await q(sb.from("verification_records").insert({provider_id:ME.id,doc_type:"identity",file_path:path}));toast("Submitted. An administrator will review it.")}
 else if(a==="add"){const t=$("#nt").value.trim(),r=+$("#nr").value,f=$("#na").files[0];
  if(!t||!(r>0))return toast("Enter a title and a rent above zero.");if(!okFile(f))return toast("Attach an authority-to-let document (PDF, JPG or PNG, up to 5 MB).");
  const path=`${ME.id}/authority-${Date.now()}-${safe(f.name)}`;await q(docs().upload(path,f));
  const p=await q(sb.from("properties").insert({provider_id:ME.id,type_id:+$("#ny").value,location_id:+$("#nl").value,title:t,description:$("#nd").value.trim()||null,amenities:$("#nm").value.trim()||null,bedrooms:+$("#nb").value||0,monthly_rent:r}).select().single());
  await q(sb.from("verification_records").insert({provider_id:ME.id,property_id:p.property_id,doc_type:"authority_to_let",file_path:path}));$("#dlg").close();toast("Submitted. An administrator will review it.")}
 else if(a==="vr"){await q(sb.from("viewing_requests").update({status:v}).eq("request_id",id));toast("Response sent to the tenant.")}
 else if(a==="read")await q(sb.from("notifications").update({is_read:true}).eq("notification_id",id));
 else if(a==="vok"){await q(sb.rpc("review_verification",{vid:id,approve:true}));toast("Provider verified.")}
 else if(a==="vno"){const n=reason();if(n===null)return;await q(sb.rpc("review_verification",{vid:id,approve:false,notes:n}));toast("Rejected.")}
 else if(a==="lok"){if(ATL[id])await q(sb.rpc("review_verification",{vid:ATL[id].verification_id,approve:true}));await q(sb.rpc("review_listing",{pid:id,approve:true}));toast("Listing approved.")}
 else if(a==="lno"){const n=reason();if(n===null)return;if(ATL[id])await q(sb.rpc("review_verification",{vid:ATL[id].verification_id,approve:false,notes:n}));await q(sb.rpc("review_listing",{pid:id,approve:false,notes:n}));toast("Listing rejected.")}
 else return;
 await render()}

document.addEventListener("click",async e=>{const b=e.target.closest("button[data-a]");if(!b)return;b.disabled=true;try{await act(b)}catch(err){console.error(err)}finally{b.disabled=false}});
document.addEventListener("change",async e=>{const t=e.target;
 if(t.id==="fl")F.loc=t.value;else if(t.id==="ft")F.type=t.value;else if(t.id==="fm")F.max=t.value;else if(t.id==="fs")F.saved=!!t.value;
 else if(t.dataset.a==="av"){try{await q(sb.from("properties").update({availability_status:t.value}).eq("property_id",+t.dataset.id));toast("Availability updated and logged.")}catch{}}
 else return;
 render()});

(async()=>{
 const{data:{session}}=await sb.auth.getSession();
 if(!session){location.replace("login.html");return}
 try{ME=await q(sb.from("users").select("*").eq("id",session.user.id).single());
  [LOC,TYPES]=await Promise.all([q(sb.from("locations").select("*").order("city").order("area")),q(sb.from("property_types").select("*"))]);
  if(ME.status!=="active"){$("#app").innerHTML=`<div class="empty">This account has been suspended.</div>`;return}
  await render()}catch(e){console.error(e);$("#app").innerHTML=`<div class="empty">Could not load your account. Please log out and log in again.</div>`}})();
