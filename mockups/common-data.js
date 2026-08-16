window.TABIAMI_DATA = {
  trip: {
    title: "週末の東京アート旅",
    dateLabel: "10月18日（土）〜 10月19日（日）",
    currentUser: { id: "ai", name: "あい", initials: "あ" },
    members: [
      { id: "yuki", name: "ゆき", initials: "ゆ" },
      { id: "ken", name: "けん", initials: "け" },
      { id: "ai", name: "あい", initials: "あ" }
    ]
  },
  messages: [
    {
      id: "message-museum",
      author: "ゆき",
      initials: "ゆ",
      text: "土曜の午前は #東京都美術館 に行きたいな。気になる！",
      time: "09:18",
      mentions: [{ type: "note", id: "note-museum" }]
    },
    {
      id: "message-ramen",
      author: "けん",
      initials: "け",
      text: "お昼は駅前のラーメンも行ってみたい。@あい さん、並ぶなら早めがいいかも。",
      time: "09:24",
      mentions: [{ type: "user", id: "ai" }]
    },
    {
      id: "message-market",
      author: "あい",
      initials: "あ",
      text: "#谷中銀座 を散歩するのもよさそう。夕方なら夕焼けも見られそうだね。",
      time: "09:31",
      mine: true,
      mentions: [{ type: "note", id: "note-yanaka" }]
    },
    {
      id: "message-hold",
      author: "けん",
      initials: "け",
      text: "ラーメンは今回はなしで、美術館の滞在を長めにしよう。",
      time: "09:42",
      replyTo: "message-ramen"
    },
    {
      id: "message-reply",
      author: "あい",
      initials: "あ",
      text: "いいね、@ゆき さん。#谷中銀座 も夕方に入れよう！",
      time: "09:48",
      mine: true,
      mentions: [
        { type: "user", id: "yuki" },
        { type: "note", id: "note-yanaka" }
      ],
      replyTo: "message-market"
    },
    {
      id: "message-revoked",
      author: "あい",
      initials: "あ",
      text: "一度送ったメッセージです",
      time: "09:51",
      mine: true,
      revoked: true
    },
    {
      id: "message-sensoji",
      author: "ゆき",
      initials: "ゆ",
      text: "浅草寺も候補に入れたいな。午前なら #東京都美術館 と迷いそう。",
      time: "09:55",
      mentions: [{ type: "note", id: "note-museum" }]
    },
    {
      id: "message-teamlab",
      author: "けん",
      initials: "け",
      text: "午後は #チームラボプラネッツ も面白そう。予約が必要か調べてみる。",
      time: "10:01",
      mentions: [{ type: "note", id: "note-teamlab" }]
    },
    {
      id: "message-cost",
      author: "あい",
      initials: "あ",
      text: "#東京都美術館 は一般1,800円くらい。滞在は2時間見ておくと安心だね。",
      time: "10:08",
      mine: true,
      mentions: [{ type: "note", id: "note-museum" }]
    },
    {
      id: "message-museum-fee",
      author: "けん",
      initials: "け",
      text: "駅から近い #国立西洋美術館 なら1,200円で、1時間半でも回れそう。",
      time: "10:14",
      replyTo: "message-cost",
      mentions: [{ type: "note", id: "note-western-museum" }]
    },
    {
      id: "message-sensoji-option",
      author: "ゆき",
      initials: "ゆ",
      text: "浅草寺は混みそうだから、候補として残しつつ美術館を優先しよう。",
      time: "10:21"
    },
    {
      id: "message-lunch-choice",
      author: "あい",
      initials: "あ",
      text: "@けん、昼食は駅前ラーメンで大丈夫？ 12時すぎなら入れそう。",
      time: "10:29",
      mine: true,
      mentions: [{ type: "user", id: "ken" }]
    },
    {
      id: "message-withdraw",
      author: "けん",
      initials: "け",
      text: "#浅草寺 は今回は見送ろう。夕方の散歩に時間を残したい。",
      time: "10:36",
      replyTo: "message-sensoji",
      mentions: [{ type: "note", id: "note-sensoji" }]
    },
    {
      id: "message-teamlab-cost",
      author: "あい",
      initials: "あ",
      text: "#チームラボプラネッツ は約3,800円で、1時間15分ほど。移動を含めても夕方の散歩に間に合いそう。",
      time: "10:44",
      mine: true,
      mentions: [{ type: "note", id: "note-teamlab" }]
    },
    {
      id: "message-plan-summary",
      author: "ゆき",
      initials: "ゆ",
      text: "では午前は #国立西洋美術館 と東京都美術館を比較して投票しよう。",
      time: "10:52",
      mentions: [{ type: "note", id: "note-western-museum" }]
    },
    {
      id: "message-thanks",
      author: "けん",
      initials: "け",
      text: "@あい、整理ありがとう。#谷中銀座 は16時ごろに入れるのがよさそう。",
      time: "11:01",
      mentions: [
        { type: "user", id: "ai" },
        { type: "note", id: "note-yanaka" }
      ]
    },
    {
      id: "message-final",
      author: "あい",
      initials: "あ",
      text: "費用と時間を見ながら決められるようにしておいたよ。",
      time: "11:08",
      mine: true,
      replyTo: "message-plan-summary"
    }
  ],
  notes: [
    {
      id: "note-museum",
      title: "東京都美術館",
      memo: "企画展をゆっくり見る。チケットは事前購入できそう。",
      attrs: ["上野公園", "約2時間", "午前", "1,800円"],
      origin: "ai",
      source: "message-museum",
      sourceLabel: "ゆき「美術館に行きたい」"
    },
    {
      id: "note-western-museum",
      title: "国立西洋美術館",
      memo: "駅から近く、企画展と常設展をまとめて見られる候補。",
      attrs: ["上野公園", "約1時間30分", "午前", "1,200円"],
      origin: "ai",
      source: "message-museum",
      sourceLabel: "ゆき「美術館に行きたい」"
    },
    {
      id: "note-ramen",
      title: "駅前ラーメン",
      memo: "上野駅前の人気店。混雑状況を見て判断。",
      attrs: ["上野駅・広小路口", "約45分", "昼", "1,200円"],
      origin: "ai",
      source: "message-ramen",
      sourceLabel: "けん「駅前のラーメン」",
      status: "held",
      holdReason: "今回は見送り"
    },
    {
      id: "note-yanaka",
      title: "谷中銀座を散歩",
      memo: "夕焼けだんだんで写真を撮りたい。",
      attrs: ["台東区谷中", "約1時間30分", "夕方", "無料"],
      origin: "ai",
      source: "message-market",
      sourceLabel: "あい「谷中銀座を散歩」"
    },
    {
      id: "note-cafe",
      title: "古書店カフェで休憩",
      memo: "歩き疲れたら立ち寄る候補。電源あり。",
      attrs: ["根津駅から徒歩5分", "約45分", "午後", "800円〜"],
      origin: "user",
      source: null,
      sourceLabel: null
    },
    {
      id: "note-sensoji",
      title: "浅草寺",
      memo: "雷門から仲見世を歩く。混雑状況を見て判断。",
      attrs: ["台東区浅草", "約1時間", "午前", "無料"],
      origin: "ai",
      source: "message-sensoji",
      sourceLabel: "ゆき「浅草寺も候補」",
      status: "held",
      holdReason: "今回は見送り"
    },
    {
      id: "note-teamlab",
      title: "チームラボプラネッツ",
      memo: "水に入る展示。事前予約が必要な候補。",
      attrs: ["豊洲", "約1時間15分", "午後", "3,800円"],
      origin: "ai",
      source: "message-teamlab",
      sourceLabel: "けん「午後はチームラボ」"
    },
    {
      id: "note-boat",
      title: "隅田川クルーズ",
      memo: "浅草から日の出桟橋まで。天候がよければ検討。",
      attrs: ["浅草吾妻橋", "約40分", "午後", "1,500円前後"],
      origin: "ai",
      source: "message-sensoji",
      sourceLabel: "ゆき「浅草寺も候補」"
    },
    {
      id: "note-craft",
      title: "上野の工芸ショップ",
      memo: "旅の記念に小さなお土産を探す。",
      attrs: ["上野広小路", "未定", "夕方", "未確認"],
      origin: "user",
      source: null,
      sourceLabel: null
    }
  ],
  plans: [
    {
      id: "plan-museum",
      noteId: "note-museum",
      title: "東京都美術館",
      time: "10:00–12:00",
      start: "10:00",
      end: "12:00",
      location: "上野公園",
      type: "plan",
      status: "adopted",
      origin: "chat",
      votes: 7
    },
    {
      id: "plan-museum-option",
      noteId: "note-western-museum",
      title: "国立西洋美術館",
      time: "10:00–11:30",
      start: "10:00",
      end: "11:30",
      location: "上野公園",
      type: "option",
      status: "option",
      origin: "chat",
      proposalType: "conflict",
      votes: 4
    },
    {
      id: "plan-lunch-option",
      noteId: "note-ramen",
      title: "駅前ラーメン",
      time: "12:15–13:00",
      start: "12:15",
      end: "13:00",
      location: "上野駅・広小路口",
      type: "option",
      status: "option",
      origin: "chat",
      proposalType: "conflict",
      votes: 2
    },
    {
      id: "plan-cafe",
      noteId: "note-cafe",
      title: "古書店カフェで休憩",
      time: "13:15–14:00",
      start: "13:15",
      end: "14:00",
      location: "根津",
      type: "plan",
      status: "draft",
      origin: "chat",
      votes: 6
    },
    {
      id: "plan-market",
      noteId: "note-yanaka",
      title: "谷中銀座を散歩",
      time: "16:00–17:30",
      start: "16:00",
      end: "17:30",
      location: "台東区谷中",
      type: "plan",
      status: "adopted",
      origin: "chat"
    },
    {
      id: "plan-teamlab-option",
      noteId: "note-teamlab",
      title: "チームラボプラネッツ",
      time: "14:30–15:45",
      start: "14:30",
      end: "15:45",
      location: "豊洲",
      type: "option",
      status: "option",
      origin: "chat",
      proposalType: "conflict",
      votes: 3
    },
    {
      id: "plan-ai-lunch-gap",
      title: "上野公園でひと休み",
      time: "12:00–12:15",
      start: "12:00",
      end: "12:15",
      location: "上野公園",
      type: "suggestion",
      status: "suggested",
      origin: "ai",
      proposalType: "gap",
      aiReason: "美術館の終了から昼食候補の開始まで、15分の余裕があります。"
    },
    {
      id: "plan-ai-evening-transfer",
      title: "根津から谷中へ移動",
      time: "15:45–16:00",
      start: "15:45",
      end: "16:00",
      location: "根津 → 谷中",
      type: "suggestion",
      status: "suggested",
      origin: "ai",
      proposalType: "gap",
      aiReason: "午後の予定と谷中銀座の開始時刻の間に、移動時間を確保できます。"
    }
  ],
  calendarEvents: [
    {
      id: "event-hotel",
      title: "上野のホテル（チェックイン）",
      type: "plan",
      label: "プラン",
      date: "10/18",
      time: "終日",
      allDay: true,
      detail: "チェックイン 15:00 / チェックアウト 10:00",
      location: "上野駅から徒歩8分",
      color: "coral",
      top: 65,
      height: 130,
      left: "18px",
      right: "18px"
    },
    {
      id: "event-museum",
      title: "東京都美術館",
      type: "plan",
      label: "プラン",
      date: "10/18",
      time: "10:00–12:00",
      detail: "企画展をゆっくり見る。チケットは事前購入。",
      location: "上野公園",
      cost: "1,800円",
      color: "coral",
      top: 65,
      height: 130,
      left: "18px",
      right: "18px",
      noteId: "note-museum",
      planId: "plan-museum"
    },
    {
      id: "event-move",
      title: "移動：上野 → 根津",
      type: "plan",
      label: "移動",
      date: "10/18",
      time: "12:00–12:15",
      detail: "徒歩または東京メトロで移動",
      location: "上野駅から根津駅",
      color: "lavender",
      top: 195,
      height: 24,
      left: "18px",
      right: "18px"
    },
    {
      id: "event-lunch",
      title: "家族との昼食",
      type: "personal",
      label: "個人",
      date: "10/18",
      time: "12:15–13:00",
      detail: "合流できたら一緒に昼食。プラン候補と時間が重なっています。",
      location: "上野駅・広小路口",
      color: "blue",
      top: 219,
      height: 52,
      left: "43%",
      right: "18px"
    },
    {
      id: "event-undecided",
      title: "未定：昼食の候補を選択",
      type: "undecided",
      label: "未定",
      date: "10/18",
      time: "12:15–13:00",
      detail: "画面2で投票中の候補があります。",
      color: "dashed",
      top: 219,
      height: 68,
      left: "18px",
      right: "58%",
      planId: "plan-lunch-option"
    },
    {
      id: "event-cafe",
      title: "古書店カフェで休憩",
      type: "plan",
      label: "プラン",
      date: "10/18",
      time: "13:15–14:00",
      detail: "歩き疲れたら立ち寄る候補。電源あり。",
      location: "根津",
      color: "coral",
      top: 292,
      height: 49,
      left: "18px",
      right: "18px",
      noteId: "note-cafe",
      planId: "plan-cafe"
    },
    {
      id: "event-market",
      title: "谷中銀座を散歩",
      type: "plan",
      label: "プラン",
      date: "10/18",
      time: "16:00–17:30",
      detail: "夕焼けだんだんで写真を撮る。",
      location: "台東区谷中",
      color: "coral",
      top: 455,
      height: 98,
      left: "18px",
      right: "18px",
      noteId: "note-yanaka",
      planId: "plan-market"
    },
    {
      id: "event-train",
      title: "新幹線（帰り）",
      type: "external",
      label: "外部",
      date: "10/19",
      time: "17:30–19:45",
      detail: "東京駅 → 新大阪駅",
      location: "東京駅",
      color: "green",
      top: 0,
      height: 0,
      left: "18px",
      right: "18px"
    }
  ],
  history: [
    {
      id: "v8",
      date: "10月18日（土）",
      time: "09:46",
      author: "けん",
      title: "投票結果を反映",
      summary: "美術館の採用案を東京都美術館に確定"
    },
    {
      id: "v7",
      date: "10月18日（土）",
      time: "09:44",
      author: "AI",
      title: "プランを再構成",
      summary: "付箋の更新を検知し、昼食候補を追加"
    },
    {
      id: "v6",
      date: "10月17日（金）",
      time: "21:10",
      author: "ゆき",
      title: "付箋から更新",
      summary: "「谷中銀座を散歩」の希望時間帯を夕方へ変更"
    },
    {
      id: "v5",
      date: "10月17日（金）",
      time: "20:52",
      author: "匿名ユーザー",
      title: "予定を追加",
      summary: "古書店カフェで休憩を候補に追加"
    }
  ]
};
