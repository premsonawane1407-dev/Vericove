const minutesAgo = minutes => new Date(Date.now() - minutes * 60_000).toISOString();

const message = (id, from, text, minutes) => ({
  id,
  from,
  text,
  created_at: minutesAgo(minutes),
  reactions: [],
});

/** Fictional, local-only examples for the demo inbox. */
export function sampleDmConversations() {
  return [
    {
      id: 'demo-dm-kind-oak',
      demo: true,
      name: 'KindOak',
      handle: '@KindOak',
      preview: 'A short list helps me keep my questions in view.',
      time: minutesAgo(18),
      unread: true,
      request: false,
      loaded: true,
      messages: [
        message('demo-kind-1', 'them', 'How do you like to keep track of questions before an appointment?', 46),
        message('demo-kind-2', 'me', 'I’m trying a short list so I can keep the most important ones in view.', 34),
        message('demo-kind-3', 'them', 'That sounds thoughtful. I use one question per line, which makes it easier for me to scan.', 18),
      ],
    },
    {
      id: 'demo-dm-soft-morning',
      demo: true,
      name: 'SoftMorning',
      handle: '@SoftMorning',
      preview: 'I’m glad the conversation felt welcoming.',
      time: minutesAgo(155),
      unread: false,
      request: false,
      loaded: true,
      messages: [
        message('demo-soft-1', 'me', 'I’m new to the community and still finding my way around.', 188),
        message('demo-soft-2', 'them', 'Welcome. I hope it feels comfortable to join in at your own pace.', 177),
        message('demo-soft-3', 'me', 'Thank you. It already feels welcoming.', 155),
      ],
    },
    {
      id: 'demo-dm-maple-sky',
      demo: true,
      name: 'MapleSky',
      handle: '@MapleSky',
      preview: 'A small pause between tasks helps me reset.',
      time: minutesAgo(1_320),
      unread: false,
      request: false,
      loaded: true,
      messages: [
        message('demo-maple-1', 'them', 'What helps you take a breath during a busy day?', 1_350),
        message('demo-maple-2', 'me', 'A small pause between tasks helps me reset.', 1_320),
      ],
    },
  ];
}
