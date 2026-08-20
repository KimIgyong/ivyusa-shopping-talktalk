# @ivy/shoptalk-rn

Reference React Native host for the ShopTalk widget (PLN-260820).

This is a **reference implementation of the bridge contract**, not a published
SDK. Copy it into your app or depend on it by path — the contract in
`docs/guide/모바일SDK연동가이드_Mobile-SDK.ko.md` is the actual specification, and
an iOS or Android host implements the same four messages in about thirty lines.

```tsx
import { ShopTalkChat } from '@ivy/shoptalk-rn';

<ShopTalkChat
  widgetUrl="https://talk.example.com/widget/"
  shop="example.myshopify.com"
  locale="vi"
  user={{ userId: String(user.id), hash: signatureFromYourServer }}
  onClose={() => navigation.goBack()}
/>
```

`hash` is an HMAC of `userId` produced by **your server**. Never put the embed
secret in the app: an app bundle can be unpacked.
