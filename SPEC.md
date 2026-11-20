# SPEC: HERO BASE ZERO v2（フルスクリーン・ゼロテキスト体感トイ）

> **Spec-Driven Contract (変更時は先にこの仕様を更新すること)**

## 1. Goal（目的）
- 4歳児が文字説明なしで直感的に夢中になれる、100dvh フルスクリーン直接操作型の総合知育ゲーム PWA を提供する。

## 2. Functional Requirements（必須仕様）
- [ ] 100dvh 固定のパノラマ基地ホーム（巨大 T-REX メカ『レックス・ゼロ』＋6大アトラクションアイコン、縦スクロール排除）
- [ ] 6大体感アトラクション（モグモグひらがな＆ビームなぞり / 爆走ターボ数レーサー＆くるくる時計 / 巨大ロボ合体＆タッチ迷路 / ジュージューヒーローキッチン英語 / いきものおえかき＆モンスターバンド / はみがきバトル＆動くシールジオラマ＆カメラずかん）
- [ ] 60fps 全画面パーティクル＆マグネット吸着ドラッグエンジン（`js/fx.js`）
- [ ] 3スターゲージ＋超合金ガチャカプセル開封（全30種動くシール収集）＋自律おやすみタイマー＋保護者掛け算ロック
- [ ] PWA 完全オフライン動作（`manifest.webmanifest`, `sw.js` v3, アイコン, Android インストール対応）

## 3. Hard Constraints（絶対守る制約・壊さない既存機能）
- 子ども向け画面は文字に頼らないアイコン＋音声主導とし、漢字は一切使わない。
- 不正解でも減点・ゲームオーバー・叱責音を出さず、コミカルに跳ね返る優しい設計にする。
- `375px`〜`1280px` で横スクロール破綻せず、`localStorage` / `IndexedDB` 互換および XSS 防御（`sanitizeProfile`, `el()`）を維持する。
- 機密情報・個人情報・OS個人パスを一切含めない。

## 4. Acceptance Criteria（完了条件）
- [ ] Red-First 単体テスト（`node --test tests/smoke.test.mjs`）がすべて PASS。
- [ ] 0円機械ゲート（`check_pre_audit_gate`）＆異種モデル監査が PASS。
- [ ] 実機検証（`window.__runSelfTest()` PASS・コンソールエラー 0 件・Desktop/Tablet/Mobile 375px 目視）および GitHub Pages 公開反映が PASS。
