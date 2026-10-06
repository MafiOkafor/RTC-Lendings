// Document access and verification controls for application.html only.
import { rpc, result } from '../../js/data.js';
import { $, label, report, element } from '../../js/ui.js';

export function renderDocuments({ client }, { loan, documents }) {
  const root = $('[data-documents]');
  root.replaceChildren();
  if (!documents.length) root.append(element('p', 'The customer has not uploaded documents yet.'));
  documents.forEach(doc => {
    const card = $('[data-document-template]').content.firstElementChild.cloneNode(true);
    card.querySelector('[data-title]').textContent = `${label(doc.kind)} — ${doc.original_name}`;
    card.querySelector('[data-review-state]').textContent = `${label(doc.status)}: ${doc.review_note || 'Awaiting verification'}`;
    card.querySelector('[data-review-fields]').disabled = loan.status !== 'documents';

    // Download uses an authenticated request so revoked staff cannot get new files.
    card.querySelector('[data-download]').addEventListener('click', async () => {
      try {
        const blob = await result(client.storage.from('loan-documents').download(doc.storage_path));
        const url = URL.createObjectURL(blob);
        const anchor = element('a'); anchor.href = url; anchor.download = doc.original_name;
        document.body.append(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (error) { report(error); }
    });

    // Outcomes are explicit; a rejected upload never counts as verified evidence.
    card.addEventListener('submit', async event => {
      event.preventDefault();
      const button = card.querySelector('[type=submit]'); button.disabled = true;
      try {
        await rpc(client, 'review_document', {
          p_document_id: doc.id, p_verified: card.querySelector('[name=outcome]').value === 'verified',
          p_note: card.querySelector('[name=note]').value,
        });
        window.location.reload();
      } catch (error) { report(error); button.disabled = false; }
    });
    root.append(card);
  });
}
