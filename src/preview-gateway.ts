import { Modal, Notice, Setting, requestUrl } from "obsidian";
import { addBillingAccountSettings, refreshBillingSession } from "./constance-account";

const BASE = "https://app.tutivsoft.com/api/v1";
export const codePoints = (text: string): number => Array.from(text).length;
export interface GatewayHost { app: any; appId: string; installationId: string; state: any; persist(): Promise<void>; }
const hosts = new WeakMap<object, GatewayHost>();
export function configureGateway(settings: object, host: GatewayHost): void { hosts.set(settings, host); }
export function gatewayFor(settings: object): GatewayHost { const host = hosts.get(settings); if (!host) throw new Error("Managed execution is not initialized."); return host; }
const digestPattern=/^[a-f0-9]{64}$/;
const previewQuoteResultPlaceholder="0".repeat(64);
function canonical(value:any):string {
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}";
 return JSON.stringify(value);
}
function sameDimensions(a:any,b:any):boolean { return !!a&&!!b&&canonical(a)===canonical(b); }
export function validateQuote(quote:any,expected?:any):void {
 if(!quote || !Number.isSafeInteger(quote.amount)||quote.amount<1 || !Number.isSafeInteger(quote.free_units)||quote.free_units<0 || !Number.isSafeInteger(quote.paid_units)||quote.paid_units<0 || quote.free_units+quote.paid_units!==quote.amount || (quote.legacy_units??0)!==0 || quote.retained_access===true)throw new Error("Invalid AI allowance split; this app requires an exact free/paid quote with no legacy or retained-access units.");
 for(const key of ["event_id","app_id","installation_id","source_digest","result_digest","amount"])if(expected?.[key]!==undefined&&quote[key]!==expected[key])throw new Error("Allowance quote identity conflicts with this exact operation.");
 if(expected?.dimensions&&quote.dimensions!==undefined&&!sameDimensions(expected.dimensions,quote.dimensions))throw new Error("Allowance quote dimensions conflict with this exact operation.");
}
function validateGenerationQuote(quote:any,request:any,host:GatewayHost):void {
 validateQuote(quote,{event_id:request.event_id,app_id:host.appId,installation_id:host.installationId,result_digest:previewQuoteResultPlaceholder});
 if(typeof quote.source_digest!=="string"||!digestPattern.test(quote.source_digest)||!quote.dimensions||typeof quote.dimensions!=="object"||Array.isArray(quote.dimensions))throw new Error("Managed quote is missing canonical source or dimensions.");
}
function validateManagedPreview(preview:any,request:any,quote:any,host:GatewayHost):void {
 if(!preview||preview.event_id!==request.event_id||!Number.isSafeInteger(preview.amount)||preview.amount<1||typeof preview.source_digest!=="string"||!digestPattern.test(preview.source_digest)||typeof preview.result_digest!=="string"||!digestPattern.test(preview.result_digest)||!preview.dimensions||typeof preview.dimensions!=="object"||Array.isArray(preview.dimensions))throw new Error("Managed preview identity or digest is incomplete. The exact preview was not accepted.");
 if(quote&&(preview.source_digest!==quote.source_digest||preview.amount!==quote.amount||!sameDimensions(preview.dimensions,quote.dimensions)))throw new Error("Managed preview does not match the confirmed server quote. Preserve it and reconcile; no new generation was started.");
 const expectedAad=new TextEncoder().encode(`${host.appId}\n${request.event_id}`),aad=decode(preview.envelope?.aad||"");if(aad.length!==expectedAad.length||aad.some((b:number,i:number)=>b!==expectedAad[i]))throw new Error("Managed preview is bound to another app or event.");
}
function validateIdentity(value:any,host:GatewayHost,journal:any):void {
 const request=journal.request||{},amount=journal.amount??request.amount,free=journal.free_units??request.expected_free_units,paid=journal.paid_units??request.expected_paid_units,dimensions=journal.dimensions??request.dimensions;
 if(value?.event_id!==journal.event_id||value.app_id!==host.appId||value.installation_id!==host.installationId||value.source_digest!==journal.source_digest||value.result_digest!==journal.result_digest||value.amount!==amount||value.free_units!==free||value.paid_units!==paid||(value.dimensions!==undefined&&!sameDimensions(value.dimensions,dimensions)))throw new Error("Recovery identity, split, amount, or dimensions conflict.");
}
function decode(value: string) { const raw = atob(value); const out = new Uint8Array(new ArrayBuffer(raw.length)); for (let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i); return out; }
export async function digest(value: string | Uint8Array): Promise<string> { const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value; return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), b=>b.toString(16).padStart(2,"0")).join(""); }
async function send(host: GatewayHost, path: string, body?: any, authenticated = false): Promise<any> {
  const headers: Record<string,string> = {"Content-Type":"application/json"};
  if (authenticated && !host.state.billingAccessToken && host.state.billingRefreshToken) await refreshBillingSession(host.state,host.persist);
  if (host.state.billingAccessToken) headers.Authorization=`Bearer ${host.state.billingAccessToken}`;
  const request = () => requestUrl({url: `${BASE}${path}`,method: body ? "POST":"GET",headers,body: body ? JSON.stringify(body):undefined,throw:false});
  let response=await request();
  if(response.status===401 && host.state.billingRefreshToken && await refreshBillingSession(host.state,host.persist)) {headers.Authorization=`Bearer ${host.state.billingAccessToken}`;response=await request();}
  if(response.status<200||response.status>=300) throw new Error(response.json?.detail?.message || (typeof response.json?.detail === "string" ? response.json.detail : `Managed service unavailable (HTTP ${response.status}).`));
  return response.json?.data;
}
export async function credential(host: GatewayHost): Promise<string> { if(host.state.previewInstallationCredential) return host.state.previewInstallationCredential; const data=await send(host,"/public/installations",{app_id:host.appId,installation_id:host.installationId}); if(!data?.installation_credential) throw new Error("Installation verification unavailable."); host.state.previewInstallationCredential=data.installation_credential;await host.persist();return data.installation_credential; }
interface Preview { event_id:string;job_token:string;sample:string;source_digest:string;result_digest:string;amount:number;dimensions:Record<string,any>;envelope_digest:string;envelope:{algorithm:string;nonce:string;ciphertext:string;aad:string}; }
const memory = new WeakMap<object, Map<string,{preview:Preview;full?:string;owner?:string;validationError?:string}>>();
export async function managedText(host: GatewayHost,input:string,operation:string,dimensions:Record<string,any>={},image?:string): Promise<string> {
  const proof=await credential(host);
  let jobs=memory.get(host.state);if(!jobs){jobs=new Map();memory.set(host.state,jobs);}
  const id=await digest(JSON.stringify({input,operation,dimensions,image}));
  let job=jobs.get(id);
  if(job?.validationError)throw new Error(job.validationError);
  if(!job){const event_id=`preview_${crypto.randomUUID()}`;const request:any={app_id:host.appId,installation_id:host.installationId,installation_credential:proof,event_id,input,operation,dimensions,image};let quote:any;
    if(host.state.billingAccountLinked && (host.state.billingAccessToken || host.state.billingRefreshToken)) {
      quote=await send(host,"/billing/previews/quote",request,true);
      validateGenerationQuote(quote,request,host);if(quote.allowed===false)throw new Error(quote.reason||"Allowance unavailable. Choose a smaller selection or purchase; input was not truncated.");
      if(!await new SplitModal(host,quote).wait())throw new Error("Generation cancelled before provider dispatch.");
      request.expected_free_units=quote.free_units;request.expected_paid_units=quote.paid_units;
    }
    const preview=await send(host,"/public/previews",request);job={preview,validationError:"Managed preview identity is unverified. Keep it in memory and contact support; this result cannot be revealed or regenerated."};jobs.set(id,job);
    try{if(!preview?.envelope || !preview.job_token)throw new Error("Incomplete managed preview response.");validateManagedPreview(preview,request,quote,host);job.validationError=undefined;}
    catch(error){job.validationError=error instanceof Error?error.message:"Managed preview identity is unverified.";throw error;}
  }  if(job.full && job.owner===host.state.billingEmail && host.state.billingAccountLinked && host.state.billingAccessToken) return job.full;
  const full=await new PreservedPreviewModal(host,job.preview,proof,job.preview.dimensions).wait();
  job.full=full;job.owner=host.state.billingEmail;
  return full;
}
class PreservedPreviewModal extends Modal {
  private resolve!: (text:string)=>void;private reject!: (error:Error)=>void;private settled=false;
  constructor(private host:GatewayHost,private preview:Preview,private proof:string,private dimensions:Record<string,any>){super(host.app);}
  wait():Promise<string>{const result=new Promise<string>((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});this.open();return result;}
  onOpen(){
    const root=this.contentEl;root.createEl("h2",{text:"Preserved preview"});
    root.createEl("p",{text:"Keep this window and Obsidian open while registering or buying. The exact result stays only in memory. Full reveal uses allowance once; later apply or save is free."});
    const sample=root.createEl("pre",{text:Array.from(this.preview.sample).slice(0,500).join("")});sample.style.whiteSpace="pre-wrap";
    root.createEl("p",{text:`Estimated native units: ${this.preview.amount}. Constance verifies your lifetime allowance and paid balance before full reveal.`});
    const status=root.createEl("p");
    addBillingAccountSettings(root,{state:this.host.state,appId:this.host.appId,installationId:this.host.installationId,persist:this.host.persist,syncBalance:async()=>{},refresh:()=>{status.setText("Account updated. Reveal the same preview when verified.");}});
    addLivePacks(root,this.host);
    const reveal=root.createEl("button",{text:"Authorize and reveal exact result",cls:"mod-cta"});
    let quoted=false;let quotedOwner="";let confirmedSplit:any;
    reveal.onclick=async()=>{reveal.disabled=true;try{
      if(!this.host.state.billingAccessToken && !this.host.state.billingRefreshToken)throw new Error("Register, verify your email, and connect here first. Your preview is preserved.");
      if(!quoted || quotedOwner!==this.host.state.billingEmail){const operation={app_id:this.host.appId,installation_id:this.host.installationId,installation_credential:this.proof,event_id:this.preview.event_id,amount:this.preview.amount,source_digest:this.preview.source_digest,result_digest:this.preview.result_digest,dimensions:this.dimensions};const quote=await send(this.host,"/billing/operations/quote",operation,true);validateQuote(quote,operation);if(quote.allowed===false)throw new Error(quote.reason || "Allowance unavailable. The preview is preserved; choose a smaller selection or purchase.");status.setText(`Confirm full reveal: ${quote.free_units} free + ${quote.paid_units} paid ${quote.amount} native units. This is one successful useful operation.`);confirmedSplit=quote;quoted=true;quotedOwner=this.host.state.billingEmail;reveal.setText("Confirm split and reveal exact result");return;}
      const nonce=decode(this.preview.envelope.nonce),ciphertext=decode(this.preview.envelope.ciphertext),joined=new Uint8Array(new ArrayBuffer(nonce.length+ciphertext.length));joined.set(nonce);joined.set(ciphertext,nonce.length);
      const envelope_digest=await digest(joined);if(envelope_digest!==this.preview.envelope_digest)throw new Error("Preview integrity check failed.");
      if(this.preview.envelope.algorithm!=="AES-GCM" || nonce.length!==12 || ciphertext.length<16)throw new Error("Invalid preview encryption metadata.");
      const expected=new TextEncoder().encode(`${this.host.appId}\n${this.preview.event_id}`),aad=decode(this.preview.envelope.aad);if(aad.length!==expected.length||aad.some((b,i)=>b!==expected[i]))throw new Error("Preview belongs to another operation.");
      const result=await send(this.host,`/billing/previews/${encodeURIComponent(this.preview.job_token)}/reveal`,{app_id:this.host.appId,installation_id:this.host.installationId,installation_credential:this.proof,event_id:this.preview.event_id,envelope_digest,expected_free_units:confirmedSplit.free_units,expected_paid_units:confirmedSplit.paid_units},true);
      if(this.preview.envelope.algorithm!=="AES-GCM")throw new Error("Unsupported preview encryption.");
      if(result?.event_id && result.event_id!==this.preview.event_id)throw new Error("Preview authorization belongs to a different operation.");
      if(result?.state!=="committed" || result.result_digest!==this.preview.result_digest)throw new Error("Reveal authorization is not committed.");
      const key=await crypto.subtle.importKey("raw",decode(result.key),"AES-GCM",false,["decrypt"]);
      const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:nonce,additionalData:aad},key,ciphertext);const text=new TextDecoder("utf-8",{fatal:true}).decode(plain);
      if(await digest(text)!==this.preview.result_digest)throw new Error("Result integrity check failed.");
      this.host.state.previewCompletionJournal={event_id:this.preview.event_id,result_digest:this.preview.result_digest,state:"committed",owner:this.host.state.billingEmail};await this.host.persist();
      this.settled=true;this.resolve(text);this.close();
    }catch(error){quoted=false;reveal.setText("Refresh allowance split");status.setText(error instanceof Error?error.message:"Authorization failed. Preview is preserved.");}finally{reveal.disabled=false;}};
  }
  onClose(){if(!this.settled){this.settled=true;this.reject(new Error("Preview closed. No source changes were applied."));}this.contentEl.empty();}
}
/** Join configured native offers to current Paddle prices by immutable price ID. */
export function joinCurrentPacks(config:any,live:any,appId:string=config?.app_id):any[]{
  const configured=Array.isArray(config?.one_time_packs)?config.one_time_packs:[];
  const prices=Array.isArray(live?.[appId])?live[appId]:[];
  const unit=typeof config?.credit_unit_name==="string"&&config.credit_unit_name.trim()?config.credit_unit_name.trim():"credits";
  return configured.map((pack:any)=>{
    const priceId=typeof pack.price_id==="string"?pack.price_id:"";
    const price=priceId?prices.find((item:any)=>item?.price_id===priceId&&item?.interval==="one_time"):undefined;
    const units=Number(pack.credits);
    const available=!!priceId&&Number.isSafeInteger(units)&&units>0&&price?.status==="active"&&price.checkout_available===true&&typeof price.amount==="string"&&price.amount.length>0&&(!pack.product_id||price.product_id===pack.product_id);
    return {pack,price,priceId,units,unit,available};
  });
}
export function addLivePacks(root:HTMLElement,host:GatewayHost):void {
  const section=root.createDiv();const status=section.createEl("p",{text:"Loading current Paddle prices…"});
  void Promise.all([
    send(host,`/apps/${encodeURIComponent(host.appId)}/billing-config`),
    send(host,`/billing/live-prices?app_ids=${encodeURIComponent(host.appId)}`),
  ]).then(([config,live])=>{
    const offers=joinCurrentPacks(config,live,host.appId);
    if(!offers.length)throw new Error("No configured one-time offers.");status.setText("Current provider pricing. Final checkout calculates applicable tax.");
    for(const {pack,price,priceId,units,unit,available} of offers){
      const description=[price?.description,Number.isSafeInteger(units)&&units>0?`${units.toLocaleString()} ${unit}`:"",available?"":price?.checkout_unavailable_reason||"Current price unavailable"].filter(Boolean).join(" · ");
      const row=new Setting(section).setName(pack.name||pack.code||"One-time offer").setDesc(description);
      row.addButton(button=>button.setButtonText(available?`Buy ${price.amount}`:"Pricing unavailable").setDisabled(!available).onClick(async()=>{button.setDisabled(true);try{
        let pending=host.state.previewPendingCheckout;
        if(pending?.owner && pending.owner!==host.state.billingEmail)throw new Error("Sign in to the account owning the pending purchase.");
        if(pending?.checkout_id){const status=await send(host,`/billing/checkouts/${encodeURIComponent(pending.checkout_id)}`,undefined,true);if(status.settled===true||["completed","canceled","cancelled","failed","expired"].includes(status.status)){host.state.previewPendingCheckout=undefined;await host.persist();pending=undefined;}}
        if(pending&&pending.price_id&&pending.price_id!==priceId)throw new Error("A purchase is pending. Resolve its status before another purchase.");
        const legacyPlan=pending&&!pending.price_id?pending.plan_code:undefined;
        const request=pending||{price_id:priceId,idempotency_key:`checkout_${crypto.randomUUID()}`,owner:host.state.billingEmail};host.state.previewPendingCheckout=request;await host.persist();
        if(!host.state.billingAccessToken)await refreshBillingSession(host.state,host.persist);
        const oldCheckout=!!legacyPlan;
        const response=await requestUrl({url:`${BASE}/billing/${oldCheckout?"checkout":"checkout-price"}`,method:"POST",headers:{Authorization:`Bearer ${host.state.billingAccessToken}`,"Content-Type":"application/json","Idempotency-Key":request.idempotency_key},body:JSON.stringify(oldCheckout?{app_id:host.appId,installation_id:host.installationId,plan_code:legacyPlan,quantity:1}:{app_id:host.appId,installation_id:host.installationId,price_id:request.price_id,quantity:1}),throw:false});
        if(response.status<200||response.status>=300)throw new Error(response.json?.detail?.message||"Checkout unavailable; refresh current prices.");
        const checkout=response.json?.data;if(!checkout?.checkout_id)throw new Error("Checkout is still being confirmed; retry the same purchase to recover it safely.");
        request.checkout_id=String(checkout.checkout_id);await host.persist();
        if(typeof checkout.checkout_url==="string"&&checkout.checkout_url)window.open(checkout.checkout_url,"_blank","noopener");
        else new Notice("Checkout is still being confirmed. Its status will refresh when you return.");
      }catch(error){new Notice(error instanceof Error?error.message:"Checkout unavailable.");}finally{button.setDisabled(!available);}}));
    }
  }).catch(()=>status.setText("Pricing temporarily unavailable. Your preview remains available; buying is disabled."));
}

export interface DurableReservation { eventId:string; source:"free"|"purchased"; commit():Promise<{kind:"committed"|"pending"}>; rollback():Promise<void>; markWriteUncertain():Promise<void>; }
export async function reserveLocal(host:GatewayHost,input:string,result:string,amount:number,dimensions:Record<string,number>):Promise<DurableReservation>{
  const installation_credential=await credential(host),source_digest=await digest(input),result_digest=await digest(result),owner=host.state.billingEmail.trim().toLowerCase();
  const current=host.state.previewWriteJournal,previousRequest=current?.request||{},previousAmount=current?.amount??previousRequest.amount,previousDimensions=current?.dimensions??previousRequest.dimensions;
  const sameContent=!!current&&current.source_digest===source_digest&&current.result_digest===result_digest&&current.owner?.trim().toLowerCase()===owner;
  if(sameContent&&(previousAmount!==amount||!sameDimensions(previousDimensions,dimensions)||current.app_id&&current.app_id!==host.appId||current.installation_id&&current.installation_id!==host.installationId))throw new Error("The preserved result is tied to a different amount or canonical dimensions. Keep the original journal for reconciliation.");
  const same=sameContent;
  if(current&&!same&&(current.state!=="committed"&&(current.state!=="released"||current.mutation_started!==false)))throw new Error("An earlier write requires reconciliation. The original result and journal are preserved.");
  if(same&&(current.state==="write_uncertain"||current.mutation_started===true||current.state==="uncertain_released"))throw new Error("A write is uncertain. Reconcile the original journal before retrying; no alternate reservation was created.");
  if(same&&current.state==="released"&&current.mutation_started!==false)throw new Error("The released result is not confirmed unchanged. Reconcile the original journal before retrying.");
  let event_id=same&&current.state!=="released"?current.event_id:`operation_${crypto.randomUUID()}`;
  let body={app_id:host.appId,installation_id:host.installationId,installation_credential,event_id,amount,source_digest,result_digest,dimensions};
  let reservation:any;
  if(same&&current.state!=="released"){
    try{reservation=await send(host,`/billing/operations/${encodeURIComponent(event_id)}?app_id=${encodeURIComponent(host.appId)}&installation_id=${encodeURIComponent(host.installationId)}`,undefined,true);validateIdentity(reservation,host,current);}
    catch(error){if(current.state!=="request_pending")throw error;throw new Error("Reservation receipt is pending. Retry status recovery with the original event; no new authorization was sent.");}
    if(reservation.state==="released"){
      if(current.mutation_started!==false)throw new Error("The server released this event after a write may have started. Preserve the result and reconcile manually; no replay was started.");
      current.state="released";await host.persist();reservation=undefined;event_id=`operation_${crypto.randomUUID()}`;body={app_id:host.appId,installation_id:host.installationId,installation_credential,event_id,amount,source_digest,result_digest,dimensions};
    }
  }
  if(!reservation){
    const quote=await send(host,"/billing/operations/quote",body,true);validateQuote(quote,body);
    if(quote.allowed===false)throw new Error(quote.reason||"Allowance unavailable. Choose a smaller selection or purchase; input was not truncated.");
    const confirmed=await new SplitModal(host,quote).wait();if(!confirmed)throw new Error("Operation cancelled before reservation.");
    const pending={event_id,app_id:host.appId,installation_id:host.installationId,amount,free_units:quote.free_units,paid_units:quote.paid_units,dimensions,source_digest,result_digest,state:"request_pending",mutation_started:false,owner,request:{...body,expected_free_units:quote.free_units,expected_paid_units:quote.paid_units}};
    host.state.previewWriteJournal=pending;await host.persist();
    reservation=await send(host,"/billing/operations/reserve",{...body,expected_free_units:quote.free_units,expected_paid_units:quote.paid_units},true);
    validateIdentity(reservation,host,pending);
    if(reservation.state==="released"){pending.state="released";await host.persist();throw new Error("The server released this operation. Nothing was written; refresh and confirm a fresh exact quote before retrying.");}
    if(reservation.state!=="reserved"&&reservation.state!=="committed")throw new Error("Reservation is not active. The exact result is preserved; reconcile before retrying.");
  }
  const journal=host.state.previewWriteJournal;
  validateIdentity(reservation,host,journal);
  if(reservation.state!=="reserved"&&reservation.state!=="committed")throw new Error("Reservation is not active. The exact result is preserved; reconcile before retrying.");
  if(reservation.state==="committed"&&journal.mutation_started!==false)throw new Error("This operation already has a committed or uncertain write. Reconcile the original result instead of replaying it.");
  journal.state=reservation.state;journal.request={...body,expected_free_units:journal.free_units,expected_paid_units:journal.paid_units};await host.persist();
  const update=async(action:string)=>{const currentJournal=host.state.previewWriteJournal;if(currentJournal?.event_id!==event_id)throw new Error("The original operation journal is no longer active; no stale completion was sent.");const data=await send(host,`/billing/operations/${encodeURIComponent(event_id)}/${action}`,{app_id:host.appId,installation_id:host.installationId,result_digest},true);validateIdentity(data,host,currentJournal);const expected=action==="commit"?"committed":"released";if(data.state!==expected)throw new Error("The server did not confirm the requested operation state; the recovery journal is unchanged.");currentJournal.state=data.state;await host.persist();return data;};
  return {eventId:event_id,source:reservation.paid_units>0?"purchased":"free",commit:async()=>{try{await update("commit");return {kind:"committed"};}catch{return {kind:"pending"};}},rollback:async()=>{if(host.state.previewWriteJournal.state!=="write_uncertain")await update("release");},markWriteUncertain:async()=>{const currentJournal=host.state.previewWriteJournal;if(currentJournal?.event_id!==event_id)throw new Error("The original operation journal is no longer active; no stale write was started.");if(currentJournal.state!=="reserved"&&currentJournal.state!=="committed"||currentJournal.mutation_started===true||currentJournal.state==="write_uncertain")throw new Error("No unused operation hold. Nothing was written.");currentJournal.mutation_started=true;currentJournal.state="write_uncertain";await host.persist();}};
}
class SplitModal extends Modal {
 private resolve!:(confirmed:boolean)=>void;private settled=false;
 constructor(private host:GatewayHost,private quote:any){super(host.app);}
 wait():Promise<boolean>{const result=new Promise<boolean>(resolve=>this.resolve=resolve);this.open();return result;}
 onOpen(){this.contentEl.createEl("h2",{text:"Confirm allowance"});this.contentEl.createEl("p",{text:`${this.quote.free_units} free + ${this.quote.paid_units} paid native units${this.quote.legacy_units?` + ${this.quote.legacy_units} existing ${this.quote.legacy_unit}`:""}. Free completion counts once toward your lifetime starter allowance; paid work preserves exhausted trial limits.`});this.contentEl.createEl("button",{text:"Confirm",cls:"mod-cta"}).onclick=()=>{this.settled=true;this.resolve(true);this.close();};}
 onClose(){if(!this.settled)this.resolve(false);this.contentEl.empty();}
}
export async function authorizeLocalReveal(host:GatewayHost,input:string,result:string,dimensions:Record<string,number>):Promise<string>{
  const reserve=await reserveLocal(host,input,result,Math.max(1,codePoints(input)),dimensions);
  const receipt=await reserve.commit();if(receipt.kind!=="committed")throw new Error("Completion is pending. Retry the same operation after reconciliation.");return result;
}

/** Reconcile only verified writes. An uncertain or mixed observation keeps the durable hold. */
export async function reconcileLocal(host:GatewayHost,verify:()=>Promise<"written"|"unchanged"|"uncertain">):Promise<string>{
 const journal=host.state.previewWriteJournal;if(!journal)return "No pending write.";
 if(journal.owner?.trim().toLowerCase()!==host.state.billingEmail.trim().toLowerCase())throw new Error("Sign in to the account that authorized this operation.");
 const status=await send(host,`/billing/operations/${encodeURIComponent(journal.event_id)}?app_id=${encodeURIComponent(host.appId)}&installation_id=${encodeURIComponent(host.installationId)}`,undefined,true);
 validateIdentity(status,host,journal);
 if(["committed","released"].includes(status.state)){journal.state=status.state;await host.persist();return status.state;}
 const observation=journal.mutation_started===false?"unchanged":await verify();if(observation==="uncertain")return "Write remains uncertain. Review the preserved recovery journal; no refund or replay was made.";
 const action=observation==="written"?"commit":"release";const receipt=await send(host,`/billing/operations/${encodeURIComponent(journal.event_id)}/${action}`,{app_id:host.appId,installation_id:host.installationId,result_digest:journal.result_digest},true);validateIdentity(receipt,host,journal);const expected=action==="commit"?"committed":"released";if(receipt.state!==expected)throw new Error("The server did not confirm the requested operation state; the recovery journal is unchanged.");journal.state=receipt.state;await host.persist();return receipt.state;
}
