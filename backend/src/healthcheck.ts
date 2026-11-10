const response=await fetch('http://127.0.0.1:4000/api/health',{signal:AbortSignal.timeout(2500)});
if(!response.ok)process.exit(1);
