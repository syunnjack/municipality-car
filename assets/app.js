(() => {
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  setupAreaSearch(); setupDirectoryFilters(); setupCarJump(); setupComparisonTools();

  async function setupAreaSearch() {
    const root = document.querySelector('[data-area-search]'); if (!root) return;
    const input = root.querySelector('input'), button = root.querySelector('[data-search-button]'), results = root.querySelector('[data-search-results]'); let index;
    async function search() {
      const query = normalize(input.value);
      if (!query) { results.innerHTML = '<p class="muted">地域名を入力してください。</p>'; return; }
      try {
        index ||= await fetch('/data/search-index.json').then((response) => { if (!response.ok) throw new Error('検索データを取得できませんでした'); return response.json(); });
        const matches = index.filter((item) => normalize(`${item.name}${item.kana}${item.prefecture || ''}`).includes(query)).slice(0, 12);
        results.innerHTML = matches.length ? `<ul>${matches.map((item) => `<li><a href="${item.path}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml([item.prefecture, item.type].filter(Boolean).join('・'))}</span></a></li>`).join('')}</ul>` : '<p class="muted">一致する地域がありません。入力を短くしてお試しください。</p>';
      } catch (error) { results.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`; }
    }
    button.addEventListener('click', search);
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); search(); } });
  }

  function setupDirectoryFilters() {
    document.querySelectorAll('[data-directory-filter]').forEach((input) => {
      const section = input.closest('.section'), cards = [...section.querySelectorAll('[data-directory-name]')], count = section.querySelector('[data-directory-count]');
      input.addEventListener('input', () => { const query = normalize(input.value); let visible = 0; for (const card of cards) { const show = normalize(card.dataset.directoryName).includes(query); card.hidden = !show; if (show) visible += 1; } count.textContent = `${visible}件`; });
    });
  }

  function setupCarJump() {
    const form = document.querySelector('[data-car-jump]'); if (!form) return;
    form.addEventListener('submit', (event) => { event.preventDefault(); const slug = form.querySelector('select').value; if (slug) location.href = `/cars/${slug}/`; });
  }

  function setupComparisonTools() {
    document.querySelectorAll('[data-comparison-tool]').forEach((tool) => {
      const form = tool.querySelector('[data-comparison-form]'), output = tool.querySelector('[data-comparison-output]'), storageKey = `municipality-car:comparison:${location.pathname}`;
      const readRows = () => { try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; } };
      function render() {
        const rows = readRows().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
        if (!rows.length) { output.innerHTML = '<p class="muted empty-state">まだ比較データがありません。査定結果を受け取ったら追加してください。</p>'; return; }
        output.innerHTML = `<div class="table-wrap"><table><thead><tr><th>査定会社</th><th>提示額</th><th>入金予定</th><th>条件</th><th><span class="visually-hidden">操作</span></th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${escapeHtml(row.company)}</td><td>${row.amount ? `${Number(row.amount).toLocaleString('ja-JP')}円` : '未入力'}</td><td>${escapeHtml(row.paymentDate || '未入力')}</td><td>${escapeHtml(row.notes || '—')}</td><td><button class="text-button" type="button" data-delete-row="${index}">削除</button></td></tr>`).join('')}</tbody></table></div><button class="text-button clear-button" type="button" data-clear-rows>すべて消去</button>`;
      }
      form.addEventListener('submit', (event) => { event.preventDefault(); const data = new FormData(form), rows = readRows(); rows.push({ company: data.get('company'), amount: data.get('amount'), paymentDate: data.get('paymentDate'), notes: data.get('notes') }); localStorage.setItem(storageKey, JSON.stringify(rows.slice(-10))); form.reset(); render(); });
      output.addEventListener('click', (event) => { const deleteButton = event.target.closest('[data-delete-row]'); if (deleteButton) { const rows = readRows().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)); rows.splice(Number(deleteButton.dataset.deleteRow), 1); localStorage.setItem(storageKey, JSON.stringify(rows)); render(); } if (event.target.closest('[data-clear-rows]')) { localStorage.removeItem(storageKey); render(); } });
      render();
    });
  }
})();
