import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/validate-address/handler.js';

const ADDRESS = {name:'Jamie Buyer',street1:'123 main st',city:'Springfield',state:'IL',zip:'62704',country:'US'};

test('validate-address requires sign-in and a configured Shippo key, and normalizes the response',async()=>{
  const env=key=>({SHIPPO_API_KEY:'test-key',SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon'}[key]);
  const createClient=()=>({auth:{getUser:async()=>({data:{user:{id:'u1'}},error:null})}});
  const request=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer token',...headers},body:JSON.stringify(body)});

  // No Authorization header at all -- rejected before ever touching Shippo.
  const noAuthHandler=createHandler({createClient,env,fetcher:async()=>{throw new Error('should not be called');}});
  assert.equal((await noAuthHandler(new Request('https://example.test',{method:'POST',body:JSON.stringify({address:ADDRESS})}))).status,401);

  // Missing the Shippo key entirely -- a config problem, not the caller's fault.
  const noKeyEnv=key=>({SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon'}[key]);
  assert.equal((await createHandler({createClient,env:noKeyEnv})(request({address:ADDRESS}))).status,503);

  // Incomplete address -- rejected before calling out to Shippo at all.
  const incompleteHandler=createHandler({createClient,env,fetcher:async()=>{throw new Error('should not be called');}});
  assert.equal((await incompleteHandler(request({address:{name:'Jamie',street1:'',city:'Springfield',state:'IL',zip:'62704',country:'US'}}))).status,400);

  // Happy path -- Shippo returns a standardized/corrected address plus a validity verdict.
  let sentBody;
  const fetcher=async(url,options)=>{
    assert.equal(url,'https://api.goshippo.com/addresses/');
    assert.equal(options.headers.Authorization,'ShippoToken test-key');
    sentBody=JSON.parse(options.body);
    return {ok:true,json:async()=>({
      name:'Jamie Buyer',street1:'123 Main St',street2:'',city:'Springfield',state:'IL',zip:'62704-1234',country:'US',phone:'',
      validation_results:{is_valid:true,messages:[{source:'USPS',type:'zip_correction',code:'zip_plus4',text:'ZIP+4 code added.'}]},
    })};
  };
  const handler=createHandler({createClient,env,fetcher});
  const result=await handler(request({address:ADDRESS}));
  assert.equal(result.status,200);
  const body=await result.json();
  assert.equal(sentBody.validate,true);
  assert.equal(sentBody.street1,'123 main st'); // sent exactly as entered, uncorrected
  assert.equal(body.is_valid,true);
  assert.deepEqual(body.messages,['ZIP+4 code added.']);
  assert.equal(body.suggested.street1,'123 Main St'); // Shippo's standardized capitalization
  assert.equal(body.suggested.zip,'62704-1234');

  // Shippo says it could not verify the address -- still returns 200 with is_valid:false, not an error
  // (a false negative shouldn't block checkout, just inform the buyer).
  const invalidFetcher=async()=>({ok:true,json:async()=>({...ADDRESS,validation_results:{is_valid:false,messages:[{text:'Address not found.'}]}})});
  const invalidResult=await createHandler({createClient,env,fetcher:invalidFetcher})(request({address:ADDRESS}));
  assert.equal(invalidResult.status,200);
  assert.equal((await invalidResult.json()).is_valid,false);

  // Shippo itself errors -- surfaced as a clean 502, not a crash.
  const downFetcher=async()=>({ok:false});
  assert.equal((await createHandler({createClient,env,fetcher:downFetcher})(request({address:ADDRESS}))).status,502);
});
