
// STUB: Replace with real Solana program calls in prod.
export async function initEscrow({threadId, amount, deadlineMs}:{threadId:string,amount:number,deadlineMs:number}){
  return { tx: 'stub-init', status:'locked', until: Date.now()+deadlineMs };
}
export async function releaseEscrow({threadId}:{threadId:string}){
  return { tx: 'stub-release', status:'released' };
}
export async function refundEscrow({threadId}:{threadId:string}){
  return { tx: 'stub-refund', status:'refunded' };
}
