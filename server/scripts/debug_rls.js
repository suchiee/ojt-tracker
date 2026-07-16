require('dotenv').config();
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL});

async function test() {
  const client = await p.connect();
  try {
    // Test 1: set_config with 3rd param = true (session-local within transaction)
    const r1 = await client.query("SELECT set_config('request.jwt.claim.sub','99dbc13d-e761-402d-8b8e-277eab6f88ac',true) as cfg");
    console.log('set_config result:', r1.rows[0]);
    
    // Test 2: read it back immediately
    const r2 = await client.query("SELECT current_setting('request.jwt.claim.sub', true) as sub");
    console.log('current_setting read:', r2.rows[0]);
    
    // Test 3: call auth.uid() 
    const r3 = await client.query("SELECT auth.uid() as uid");
    console.log('auth.uid():', r3.rows[0]);
    
    // Test 4: Try with false (persists for session, not just transaction)
    await client.query("SELECT set_config('request.jwt.claim.sub','99dbc13d-e761-402d-8b8e-277eab6f88ac',false)");
    const r4 = await client.query("SELECT auth.uid() as uid");
    console.log('auth.uid() after false param:', r4.rows[0]);
    
  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    client.release();
    await p.end();
  }
}
test();
