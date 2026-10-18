const A={
 me(){try{return JSON.parse(sessionStorage.getItem("hl_me"))}catch{return null}},
 async login(e,p){
  const{data,error}=await sb.auth.signInWithPassword({email:e.trim().toLowerCase(),password:p});if(error)return null;
  const{data:u}=await sb.from("users").select("*").eq("id",data.user.id).single();if(!u)return null;
  try{sessionStorage.setItem("hl_me",JSON.stringify({name:u.full_name,role:u.role}))}catch{}return u},
 async register(n,e,p,r){
  if(!n.trim()||!e.includes("@"))return"Enter your name and a valid email.";
  if(!["tenant","provider"].includes(r))return"Choose tenant or provider.";
  if(p.length<8)return"Use a password of at least 8 characters.";
  const{error}=await sb.auth.signUp({email:e.trim().toLowerCase(),password:p,options:{data:{full_name:n.trim(),role:r}}});
  return error?error.message:null},
 async out(){await sb.auth.signOut();try{sessionStorage.removeItem("hl_me")}catch{}location.href="login.html"}
};
