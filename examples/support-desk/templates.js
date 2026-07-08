export const SUPPORT_TEMPLATES = {
  refund: {
    title: 'Refund / duplicate charge',
    body: 'Hi {{customer}},\n\nI checked the failed billing event and confirmed that the duplicate charge can be reversed. I have escalated the receipt refresh to our payments queue and will keep this ticket open until the invoice reflects the correction.\n\nYou do not need to retry the upgrade from your side right now.',
  },
  'need-more-info': {
    title: 'Need more information',
    body: 'Hi {{customer}},\n\nThanks for the report. I can continue investigating, but I need one more detail from you: the affected workspace URL and the approximate time when you last reproduced the issue.\n\nOnce you send that over, I will check the request trace and update this ticket.',
  },
  export: {
    title: 'Export job retry',
    body: 'Hi {{customer}},\n\nI found that the export job is stuck in retry state. I am moving it back into the workspace queue and will confirm here when the archive is ready.\n\nNo action is required on your side while I do that.',
  },
  safari: {
    title: 'Safari login loop',
    body: 'Hi {{customer}},\n\nThis looks like a stale Safari session loop. I am invalidating the old session from our side. Please keep this tab open for a minute, then refresh once and sign in again.',
  },
  webhook: {
    title: 'Webhook delivery delay',
    body: 'Hi {{customer}},\n\nI checked the delivery queue and can see delayed retries for your endpoint. I am escalating this to the platform queue and will post the retry window here once it is confirmed.',
  },
};

export function renderTemplate(name, ticket) {
  const template = SUPPORT_TEMPLATES[name];
  if (!template) return '';
  return template.body
    .replaceAll('{{customer}}', ticket?.customer?.contact ?? ticket?.customer?.name ?? 'there')
    .replaceAll('{{ticket}}', ticket?.id ?? 'this ticket');
}
