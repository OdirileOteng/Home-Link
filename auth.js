/* Prototype auth: accounts live in this browser only. Replace with a real backend (see README). */
const A={
 async h(p){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("homelink:"+p));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")},
 users(){try{return JSON.parse(localStorage.getItem("hl_users"))||[]}catch{return[]}},
 save(u){try{localStorage.setItem("hl_users",JSON.stringify(u))}catch{}},
 me(){try{return JSON.parse(sessionStorage.getItem("hl_me"))}catch{return null}},
 async seed(){if(A.users().length)return;A.save([
  {name:"Administrator",email:"admin@homelink.test",role:"admin",pw:await A.h("Admin123!")},
  {name:"Mpho Dikgang",email:"provider@homelink.test",role:"provider",pid:1,pw:await A.h("Provider123!")},
  {name:"Lesedi Agents",email:"agent@homelink.test",role:"provider",pid:2,pw:await A.h("Agent123!")},
  {name:"Tenant Sample",email:"tenant@homelink.test",role:"tenant",pw:await A.h("Tenant123!")}])},
 async login(e,p){await A.seed();const h=await A.h(p),u=A.users().find(x=>x.email===e.trim().toLowerCase()&&x.pw===h);if(!u)return null;
  const m={name:u.name,email:u.email,role:u.role,pid:u.pid};try{sessionStorage.setItem("hl_me",JSON.stringify(m))}catch{}return m},
 async register(n,e,p,r){await A.seed();e=e.trim().toLowerCase();const us=A.users();
  if(!n.trim()||!e.includes("@"))return"Enter your name and a valid email.";
  if(!["tenant","provider"].includes(r))return"Choose tenant or provider.";
  if(p.length<8)return"Use a password of at least 8 characters.";
  if(us.some(x=>x.email===e))return"That email is already registered. Log in instead.";
  const u={name:n.trim(),email:e,role:r,pw:await A.h(p)};if(r==="provider")u.pid=100+us.length;us.push(u);A.save(us);return null},
 out(){try{sessionStorage.removeItem("hl_me")}catch{}location.href="login.html"}
};
