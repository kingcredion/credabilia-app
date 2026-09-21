import React from 'react';
import { Brand } from './Brand.jsx';

const LAST_UPDATED = 'September 30, 2026';

function LegalShell({ title, children }) {
  return <div className="legal-page">
    <a className="legal-back" href="/"><Brand/></a>
    <div className="legal-draft-banner">
      <strong>Draft — pending legal review.</strong> This page is a working draft and has not yet been reviewed by an attorney. Do not rely on it as final. It is published now only so its URL can be used for account sign-in and account creation, as required by our sign-in provider.
    </div>
    <h1>{title}</h1>
    <p className="legal-updated">Last updated: {LAST_UPDATED}</p>
    {children}
  </div>;
}

export function TermsPage() {
  return <LegalShell title="Terms of Service">
    <section>
      <p>These Terms of Service ("Terms") govern your access to and use of Credabilia, including the websites located at credabilia.com and credabilia.app and any related apps (together, the "Service"), operated by Credabilia LLC ("Credabilia," "we," "us," or "our"). By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.</p>
    </section>

    <h2>1. Who can use Credabilia</h2>
    <p>You must be at least 18 years old and able to form a binding contract to create an account or use the Service. By using Credabilia, you represent that you meet these requirements and that you are not barred from using the Service under applicable law. The Service is currently offered only to users located in the United States.</p>

    <h2>2. Your account</h2>
    <p>You can sign in with a Google account or with a one-time email sign-in link. You are responsible for maintaining the security of your account and for all activity that happens under it. You agree to provide accurate account information and to keep it up to date. Credabilia is a single account for browsing, buying, selling, and community auditing — you don't need separate accounts for each.</p>

    <h2>3. What Credabilia is</h2>
    <p>Credabilia is a marketplace and community for collectibles and memorabilia. Sellers list items; buyers purchase them directly from sellers. Community members can review listing evidence and share their assessment of an item. Credabilia is not the seller of items listed by other users, is not a party to the contract of sale between a buyer and seller, and does not take ownership of items at any point. Where these Terms describe Credabilia holding funds or arranging shipping, that role is limited to the payment, escrow, and logistics functions described below — it does not make Credabilia a party to the underlying sale.</p>

    <h2>4. Listings and seller responsibilities</h2>
    <p>If you list an item for sale, you represent that:</p>
    <ul>
      <li>you own the item or otherwise have the legal right to sell it;</li>
      <li>your listing's title, description, condition, photos, and any certificate or evidence information you provide are accurate to the best of your knowledge;</li>
      <li>the item is not stolen, counterfeit, or listed in violation of any law or third party's rights; and</li>
      <li>you will ship the item you describe, in the condition described, to the buyer who purchases it.</li>
    </ul>
    <p>Credabilia does not inspect, authenticate, or take possession of items before they ship. We may remove a listing, cancel a sale, or suspend an account at our discretion if we believe a listing violates these Terms or the law.</p>

    <h2>5. Certificates, community assessments, and credibility scores — no authentication is implied</h2>
    <p>Credabilia is not an authentication, grading, or appraisal service, and nothing on Credabilia should be treated as one. Specifically:</p>
    <ul>
      <li><strong>Certificate information</strong> is entered by the seller and matched against a list of issuer names we maintain. We do not independently verify that a certificate is genuine, that it actually accompanies the item, or that the issuer named actually authenticated the item.</li>
      <li><strong>Community assessments</strong> ("Looks consistent," "Need more evidence," "I see concerns") are the personal opinions of other Credabilia members, based on photos and descriptions. They are not professional appraisals, and the members giving them are not vetted authenticators.</li>
      <li><strong>Credibility scores</strong> shown on a listing are a number we calculate from the certificate information supplied and the community assessments received. A high score reflects consistent input from these two sources — it is not a guarantee of authenticity, grade, condition, or value, and should not be the sole basis for a purchase decision, especially for high-value items.</li>
      <li><strong>Participation and learning XP</strong> reflect activity on the platform (assessments given, trivia answered). They are not a certification of expertise.</li>
    </ul>
    <p>If authenticity matters to you, seek an independent, qualified appraisal before buying or selling a high-value item.</p>

    <h2>6. AI-assisted features</h2>
    <p>Credabilia uses AI to help you draft listings, read certificate photos, generate trivia questions, and answer support questions through our assistant, King Credion. AI-generated content can be inaccurate or incomplete. You are responsible for reviewing and correcting anything AI drafts before you publish it, and for verifying anything King Credion tells you before relying on it — including anything it says about fees, shipping, or refunds. AI output is not authentication, professional advice, or a guarantee of any kind.</p>

    <h2>7. Fees</h2>
    <p>Credabilia charges sellers a platform fee on completed sales and, where applicable, a markup on shipping and insurance costs. The exact fee is shown before you publish a listing or complete a purchase. Fees may change; the fee in effect at the time of a transaction is the one that applies to it.</p>

    <h2>8. Payments and escrow</h2>
    <p>Payments are processed by Stripe, our payment processor. Credabilia does not receive or store your full card number. When you buy an item, your payment is held by Credabilia's Stripe account rather than paid to the seller immediately. Funds are released to the seller once delivery is confirmed by tracking, or automatically after a set number of days if tracking never confirms delivery. Sellers must complete Stripe's account setup (including identity verification required by Stripe) before they can receive payouts.</p>

    <h2>9. Shipping and insurance</h2>
    <p>Shipping labels and rates are provided through our shipping partner, Shippo, using the address and package details you provide. You can choose to insure a shipment for an additional cost shown at checkout; insurance is subject to the shipping carrier's and insurer's own terms, which we do not control.</p>

    <h2>10. Refunds, returns, and disputes</h2>
    <p>If a buyer requests a refund, the seller can accept it in full, offer a partial refund, require the item be shipped back before issuing a refund, or contest the request. Required returns ship on a prepaid label at Credabilia's cost; a refund is issued automatically once tracking confirms the item was delivered back to the seller. If a seller contests a request, Credabilia reviews the case and decides the outcome. We may reverse a payment to a seller's Stripe account to fund a refund. This section describes how the feature works — it is not a warranty or guarantee about any particular item, and does not limit whatever other rights you may have under applicable law.</p>

    <h2>11. Credion Coins</h2>
    <p>Credabilia may award Credion Coins (for example, through community participation rewards) that can be applied toward a future purchase's price, up to the limits shown at checkout. Credion Coins have no cash value, are non-transferable, and may expire or be forfeited if your account is closed or terminated.</p>

    <h2>12. Prohibited conduct</h2>
    <p>You agree not to: list stolen, counterfeit, or illegal items; submit false certificate information or fraudulent community assessments; harass, threaten, or impersonate another user; attempt to complete a transaction outside the Service to avoid fees; interfere with or attempt to circumvent the Service's security; or use the Service in a way that violates any applicable law.</p>

    <h2>13. Content you submit</h2>
    <p>You keep ownership of the photos, descriptions, messages, and other content you submit. By submitting it, you grant Credabilia a non-exclusive, worldwide, royalty-free license to host, display, reproduce, and distribute that content as needed to operate and promote the Service (for example, showing your listing photos to potential buyers). You are solely responsible for content you submit and for having the rights to submit it.</p>

    <h2>14. Copyright complaints (DMCA)</h2>
    <p>If you believe content on Credabilia infringes your copyright, contact us at <a href="mailto:kingcredion@credabilia.com">kingcredion@credabilia.com</a> with enough detail for us to identify the material and your claim. <em>[Credabilia intends to designate a formal DMCA agent with the U.S. Copyright Office; until that registration is complete, this section is incomplete and should not be relied on for safe-harbor purposes.]</em></p>

    <h2>15. Termination</h2>
    <p>You may stop using the Service and close your account at any time. We may suspend or terminate your account if we believe you've violated these Terms, the law, or put the Service or other users at risk. Sections of these Terms that by their nature should survive termination (including Sections 5, 10 through 14, and 16 through 20) will survive.</p>

    <h2>16. Disclaimers</h2>
    <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT AN ITEM LISTED ON CREDABILIA IS AUTHENTIC, ACCURATELY DESCRIBED, OR OF ANY PARTICULAR CONDITION OR VALUE, OR THAT THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE.</p>

    <h2>17. Limitation of liability</h2>
    <p><em>[Placeholder — liability caps and carve-outs are jurisdiction-sensitive and need attorney drafting before publication.]</em> To the maximum extent permitted by law, Credabilia will not be liable for indirect, incidental, special, consequential, or punitive damages, or for any loss of profits or data, arising from your use of the Service.</p>

    <h2>18. Indemnification</h2>
    <p>You agree to defend and indemnify Credabilia against any claim, loss, or expense (including reasonable attorneys' fees) arising from your use of the Service, your content, your listings, or your violation of these Terms.</p>

    <h2>19. Dispute resolution and arbitration</h2>
    <p><strong>You and Credabilia agree to resolve disputes through binding individual arbitration, not in court, and each waive the right to a jury trial and to participate in a class action.</strong> <em>[Placeholder — the arbitration provider, rules, and procedure (e.g., AAA), and the exact arbitration/small-claims carve-outs, need attorney drafting before publication.]</em> These Terms are governed by the laws of the State of Nevada, without regard to conflict-of-law rules. <em>[Nevada is inferred from the business address on file and should be confirmed.]</em></p>

    <h2>20. Changes to these Terms</h2>
    <p>We may update these Terms from time to time. If we make material changes, we'll update the "Last updated" date above and, where appropriate, notify you. Continuing to use the Service after changes take effect means you accept the updated Terms.</p>

    <h2>21. Contact</h2>
    <p>Credabilia LLC<br/>3651 S Arville St, Apt 145<br/>Las Vegas, NV 89103<br/>Email: <a href="mailto:kingcredion@credabilia.com">kingcredion@credabilia.com</a></p>
    <p className="field-note"><em>[The address above is a placeholder pending a dedicated business address (e.g. a PO box).]</em></p>
  </LegalShell>;
}

export function PrivacyPage() {
  return <LegalShell title="Privacy Policy">
    <section>
      <p>This Privacy Policy explains what information Credabilia LLC ("Credabilia," "we," "us," or "our") collects through credabilia.com, credabilia.app, and related apps (the "Service"), how we use it, and who we share it with. It's part of our <a href="/terms">Terms of Service</a>.</p>
    </section>

    <h2>1. Information we collect</h2>
    <h3>Account information</h3>
    <p>When you sign in with Google, we receive your name, email address, and profile photo from Google. When you sign in by email link, we collect the email address you provide. We store the display name you choose and, if you add one, a storefront name.</p>
    <h3>Marketplace and transaction information</h3>
    <p>Listings you create (title, description, category, photos, price, certificate details, package dimensions); your purchase and sales history; the shipping address you provide for an order (name, street address, city, state, ZIP, country, and phone number if you provide one); and refund, return, and shipment tracking details tied to your orders.</p>
    <h3>Messages and support</h3>
    <p>Messages you send to another user about an order, and messages you send to our AI support assistant, King Credion.</p>
    <h3>Community activity</h3>
    <p>Assessments you submit on other members' listings, and your trivia responses and participation/learning XP.</p>
    <h3>Information we don't collect</h3>
    <p>We do not ask for or store your Social Security number, government ID, date of birth, or full payment card number. Payment card details are entered directly with Stripe, our payment processor.</p>

    <h2>2. How we use this information</h2>
    <ul>
      <li>to operate the marketplace — creating listings, processing purchases, arranging shipping, calculating fees, and handling refunds and disputes;</li>
      <li>to power AI-assisted features (see Section 3);</li>
      <li>to communicate with you about your account, orders, and support requests;</li>
      <li>to maintain the security of the Service and prevent fraud or abuse; and</li>
      <li>to comply with legal obligations.</li>
    </ul>

    <h2>3. AI-assisted features</h2>
    <p>Certain content you submit — including listing photos, certificate photos, and text — may be sent to our AI provider, OpenAI, to draft listing content, read certificate details, generate trivia questions, or power the King Credion support assistant. We configure these requests so OpenAI does not use this data to train its models. Avoid including sensitive personal information in photos or messages beyond what's needed for the feature you're using.</p>

    <h2>4. Who we share information with</h2>
    <p>We share information with the service providers who help us run Credabilia, and only as needed for them to provide their service to us:</p>
    <ul>
      <li><strong>Supabase</strong> — hosting, database, authentication, and file storage;</li>
      <li><strong>Stripe</strong> — payment processing, seller payouts, and identity verification for payouts;</li>
      <li><strong>Shippo</strong> — shipping rates, labels, tracking, and insurance;</li>
      <li><strong>OpenAI</strong> — the AI-assisted features described in Section 3;</li>
      <li><strong>Google</strong> — sign-in, if you choose to use "Continue with Google."</li>
    </ul>
    <p>We also share the information a transaction requires with the other party to it — for example, a seller receives the buyer's shipping address to ship an order, and a buyer can see a seller's storefront name. We may disclose information if required by law, or to protect the rights, safety, or property of Credabilia or our users. We do not sell your personal information.</p>

    <h2>5. Cookies and tracking</h2>
    <p>We do not currently use advertising or analytics cookies or trackers. We use your browser's local storage to keep you signed in between visits. If this changes, we'll update this policy.</p>

    <h2>6. Data retention</h2>
    <p><em>[Placeholder — we have not yet defined specific retention periods.]</em> We retain your information for as long as your account is active and as needed to provide the Service, resolve disputes, and comply with our legal obligations. If you close your account, we may retain records related to completed transactions as required for legal, tax, or accounting purposes.</p>

    <h2>7. Your choices</h2>
    <p>You can update your display name, shipping address, and other profile information at any time in Settings. To request access to or deletion of your account and associated data, contact us at <a href="mailto:kingcredion@credabilia.com">kingcredion@credabilia.com</a>. We may need to retain certain records (for example, transaction history) even after a deletion request, as described in Section 6.</p>

    <h2>8. Children's privacy</h2>
    <p>Credabilia is not directed at, and we do not knowingly collect information from, anyone under 18. If we learn we've collected information from someone under 18, we will delete it.</p>

    <h2>9. Data security</h2>
    <p>We use reasonable technical and organizational measures to protect your information, including relying on our service providers' own security practices. No method of storage or transmission is completely secure, and we can't guarantee absolute security.</p>

    <h2>10. Where we operate</h2>
    <p>Credabilia currently serves users located in the United States, and your information is processed in the United States. If we expand outside the United States, we'll update this policy to reflect any additional protections that apply.</p>

    <h2>11. Changes to this policy</h2>
    <p>We may update this Privacy Policy from time to time. If we make material changes, we'll update the "Last updated" date above and, where appropriate, notify you.</p>

    <h2>12. Contact us</h2>
    <p>Credabilia LLC<br/>3651 S Arville St, Apt 145<br/>Las Vegas, NV 89103<br/>Email: <a href="mailto:kingcredion@credabilia.com">kingcredion@credabilia.com</a></p>
    <p className="field-note"><em>[The address above is a placeholder pending a dedicated business address (e.g. a PO box).]</em></p>
  </LegalShell>;
}
