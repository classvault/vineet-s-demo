(function(){
  const ENDPOINT = '/cgi-bin/bed.cgi/list';
  const heroStats = document.getElementById('heroStats');
  const heroTable = document.getElementById('heroTable');
  const g = document.getElementById('generalSummary');
  const i = document.getElementById('icuSummary');
  const e = document.getElementById('emergencySummary');
  const o = document.getElementById('operationSummary');

  function summarize(records){
    const totals = { General:{t:0,a:0}, ICU:{t:0,a:0}, Emergency:{t:0,a:0}, Operation:{t:0,a:0} };
    for(const r of records){ if(totals[r.ward]){ totals[r.ward].t+=r.total; totals[r.ward].a+=r.available; }}
    g.textContent = `${totals.General.a} / ${totals.General.t} available`;
    i.textContent = `${totals.ICU.a} / ${totals.ICU.t} available`;
    e.textContent = `${totals.Emergency.a} / ${totals.Emergency.t} available`;
    o.textContent = `${totals.Operation.a} / ${totals.Operation.t} available`;
    const hospitals = new Set(records.map(r=>r.hospital));
    heroStats.textContent = `${hospitals.size} hospitals • ${records.length} ward rows`;
  }

  function renderTop(records){
    heroTable.innerHTML = '';
    const top = [...records].sort((a,b)=> b.available - a.available).slice(0,6);
    for(const r of top){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.hospital}</td><td>${r.ward}</td><td>${r.total}</td><td>${r.available}</td>`;
      heroTable.appendChild(tr);
    }
  }

  async function load(){
    try{
      const res = await fetch(ENDPOINT, { cache: 'no-cache' });
      const json = await res.json();
      const records = Array.isArray(json.records) ? json.records : [];
      summarize(records);
      renderTop(records);
    }catch(err){
      heroStats.textContent = 'Failed to load stats';
    }
  }

  document.addEventListener('DOMContentLoaded', load);
  load();
})();
