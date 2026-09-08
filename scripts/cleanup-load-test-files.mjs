import { createClient } from "@supabase/supabase-js";
const client=createClient("https://lhpfrkumzpinzgkkmgmd.supabase.co","sb_publishable__YJW6ZRNOjK8z7CuJ-0OOA_GyUzRWLL",{auth:{persistSession:false},global:{headers:{"x-admin-key":"0000"}}});
const paths=[];
for(const folder of ["photos","thumbnails"]){const {data,error}=await client.storage.from("workshop-photos").list(folder,{limit:1000});if(error)throw error;for(const item of data??[])if(item.name.startsWith("load-test-"))paths.push(`${folder}/${item.name}`);}
if(paths.length){const {error}=await client.storage.from("workshop-photos").remove(paths);if(error)throw error;}
console.log(JSON.stringify({removed:paths.length}));
