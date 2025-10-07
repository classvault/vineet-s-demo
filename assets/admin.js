(function () {
  const ENDPOINT = '/cgi-bin/bed.cgi';
  const hospitalEl = document.getElementById('hospital');
  const wardEl = document.getElementById('ward');
  const totalEl = document.getElementById('total');
  const availableEl = document.getElementById('available');
  const resultEl = document.getElementById('result');
  const submitBtn = document.getElementById('submitBtn');
  const loadExample = document.getElementById('loadExample');
  const tbody = document.querySelector('#adminTable tbody');

  async function loadRecords() {
    const res = await fetch(`${ENDPOINT}/list`, { cache: 'no-cache' });
    const json = await res.json();
    const rows = Array.isArray(json.records) ? json.records : [];
    tbody.innerHTML = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.hospital}</td><td>${r.ward}</td><td>${r.total}</td><td>${r.available}</td>`;
      tbody.appendChild(tr);
    }
  }

  async function submitUpdate() {
    const params = new URLSearchParams();
    if (hospitalEl.value) params.set('hospital', hospitalEl.value);
    if (wardEl.value) params.set('ward', wardEl.value);
    if (totalEl.value) params.set('total', totalEl.value);
    if (availableEl.value) params.set('available', availableEl.value);

    if (!params.get('hospital') || !params.get('ward')) {
      resultEl.textContent = 'Hospital and Ward are required';
      resultEl.style.color = '#fca5a5';
      return;
    }

    const res = await fetch(`${ENDPOINT}/update?${params.toString()}`);
    const json = await res.json();
    if (json && json.status === 'ok') {
      resultEl.textContent = 'Update successful';
      resultEl.style.color = '#86efac';
      await loadRecords();
    } else {
      resultEl.textContent = 'Update failed';
      resultEl.style.color = '#fca5a5';
    }
  }

  submitBtn.addEventListener('click', submitUpdate);
  loadExample.addEventListener('click', () => {
    hospitalEl.value = 'AIIMS Delhi';
    wardEl.value = 'ICU';
    totalEl.value = '';
    availableEl.value = '8';
  });

  document.addEventListener('DOMContentLoaded', loadRecords);
  loadRecords();
})();
