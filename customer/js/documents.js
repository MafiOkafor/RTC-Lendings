// Private document uploads: PDFs and images up to 10 MB each.
import { session } from '../../js/session.js';
import { result, rpc, recordId } from '../../js/data.js';
import { $, showPage, report, bindForm, table, label } from '../../js/ui.js';

async function initialize() {
  const context = await session();
  if (!context) return;
  const { client } = context;
  const id = recordId();
  const loan = await result(client.from('loan_applications').select('id,customer_id,status').eq('id', id).single());
  $('[data-back]').href = `loan.html?id=${id}`;
  const refresh = async () => {
    const rows = await result(client.from('application_documents').select('*').eq('application_id', id).order('created_at'));
    table('[data-documents]', ['Type', 'File', 'Review', 'Note'], rows.map(row => [
      label(row.kind), row.original_name, label(row.status), row.review_note || 'Awaiting review',
    ]));
  };
  await refresh();
  showPage();
  if (!['submitted', 'affordability', 'documents'].includes(loan.status)) {
    $('[data-upload-fields]').disabled = true;
    $('[data-status]').textContent = 'Uploads are closed at this application stage.';
    return;
  }

  // Random paths prevent accidental replacement of already submitted evidence.
  bindForm('[data-upload]', async (fields, form) => {
    const file = fields.get('document');
    const extensions = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
    if (!file?.size || file.size > 10485760 || !extensions[file.type]) {
      throw new Error('Choose a PDF, JPG or PNG file no larger than 10 MB.');
    }
    const storagePath = `${loan.customer_id}/${id}/${crypto.randomUUID()}.${extensions[file.type]}`;
    await result(client.storage.from('loan-documents').upload(storagePath, file, { upsert: false, contentType: file.type }));
    await rpc(client, 'attach_document', {
      p_id: id, p_kind: fields.get('kind'), p_path: storagePath, p_name: file.name,
    });
    form.reset();
    await refresh();
    $('[data-status]').textContent = 'Document uploaded for verification.';
  });
}
initialize().catch(report);
