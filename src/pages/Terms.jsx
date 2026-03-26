import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const sectionVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.4 } })
};

export default function Terms() {
  const lastUpdated = "March 2026";

  return (
    <motion.div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mb-12"
        >
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Terms of Service
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-2">
            Effective: {lastUpdated}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Last updated: {lastUpdated}
          </p>
        </motion.div>

        <div className="space-y-8">
          {/* Introduction */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={0} className="prose dark:prose-invert max-w-none">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white mb-1">
                        Credabilia is a Marketplace Platform
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Credabilia ("we", "us", "our", or "Platform") is a peer-to-peer marketplace that facilitates transactions between collectors, vendors, frame shops, artists, and other service providers. We do not buy, sell, or own the items listed. We are not a party to transactions between users.
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  By accessing or using Credabilia, you agree to be bound by these Terms of Service. If you do not agree to any part of these terms, do not use our Platform.
                </p>
              </CardContent>
            </Card>
          </motion.section>

          {/* 1. Platform Role */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={1}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">1. Platform Role & Responsibilities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                   <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.1 Age Requirement</h4>
                   <p className="text-sm text-gray-700 dark:text-gray-300">
                     You must be at least 18 years of age to use this Platform. By using Credabilia, you represent and warrant that you are at least 18 years old.
                   </p>
                </div>
                <div>
                   <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.2 Marketplace Operator Only</h4>
                   <p className="text-sm text-gray-700 dark:text-gray-300">
                     Credabilia operates only as a marketplace platform. We do not:
                   </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Buy or sell items</li>
                    <li>• Take possession of items</li>
                    <li>• Authenticate items (auditor system is informational only)</li>
                    <li>• Guarantee authenticity or condition</li>
                    <li>• Fulfill orders or ship items</li>
                  </ul>
                </div>
                <div>
                   <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.3 Account Responsibility</h4>
                   <p className="text-sm text-gray-700 dark:text-gray-300">
                     You are responsible for maintaining the confidentiality of your account credentials and all activity conducted under your account. You agree to notify Credabilia immediately of any unauthorized access or use.
                   </p>
                </div>
                <div>
                   <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.4 Vendor Responsibility</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Vendors are solely responsible for:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Accuracy of item descriptions and photos</li>
                    <li>• Authenticity of items listed</li>
                    <li>• Item condition and completeness</li>
                    <li>• Legal compliance (no counterfeit, stolen, or prohibited items)</li>
                    <li>• Fulfilling orders and shipping items</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 2. Auditor System & AI Tools */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={2}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">2. Auditor System & AI Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">2.1 Informational Only</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Our auditor system, community votes, and AI analysis tools are provided for informational purposes only. They:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Do NOT guarantee authenticity</li>
                    <li>• Do NOT provide legal authentication</li>
                    <li>• Are NOT a substitute for professional authentication</li>
                    <li>• May contain errors or inaccuracies</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">2.2 User Discretion</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Buyers rely on these tools at their own risk and should conduct independent due diligence, including requesting certificates of authenticity (COA) or professional authentication before purchase.
                  </p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <p className="text-xs text-amber-900 dark:text-amber-300">
                    <strong>No Liability:</strong> Credabilia is not liable for any inaccuracies, errors, or reliance on auditor votes, community scores, or AI analysis.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 3. Fees & Payments */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={3}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">3. Platform Fees & Payment Processing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">3.1 Marketplace Fee</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Credabilia collects a <strong>12% marketplace fee</strong> on all sales. This fee covers platform operations, payment processing, customer support, and auditor rewards.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">3.2 Payment Processing</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    All payments are processed through Stripe. Users agree to Stripe's Terms of Service. Stripe may assess additional processing fees per their pricing.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">3.3 Auditor Reward Pool</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Of the 12% platform fee, <strong>1%</strong> is allocated to the Auditor Reward Pool. This pool is distributed monthly to the top 10% of auditors ranked by performance score (based on accuracy, volume, and community rating).
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Distribution is discretionary and subject to change</li>
                    <li>• Rankings reset monthly</li>
                    <li>• No guarantee of earnings</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 4. Credion Credits */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={4}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">4. Credion Credits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">4.1 Non-Monetary Value</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Credion Credits have no real-world monetary value outside the Platform. They are:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Platform currency only</li>
                    <li>• Non-transferable</li>
                    <li>• Non-redeemable for cash</li>
                    <li>• Subject to expiration or revocation</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">4.2 Usage</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Credits may be applied at checkout for item purchases. 100 Credion Credits = $1 USD equivalent on the Platform.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">4.3 Modification & Termination</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Credabilia reserves the right to modify, suspend, or revoke the Credion Credits program at any time without notice. Unused credits may expire per program rules.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 5. Shipping & Fulfillment */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={5}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">5. Shipping & Order Fulfillment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">5.1 Vendor Responsibility</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Vendors are solely responsible for:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Shipping items within stated timeframe</li>
                    <li>• Using appropriate packaging</li>
                    <li>• Obtaining tracking information</li>
                    <li>• Providing tracking to buyers</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">5.2 Buyer Address Responsibility</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Buyers are responsible for providing a complete, accurate shipping address. Credabilia is not liable for misdelivery due to incorrect address information.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">5.3 Platform Not Liable</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Credabilia is not responsible for shipping delays, carrier issues, lost packages, or customs complications. Disputes should be resolved between buyer and vendor.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 6. Service & Escrow Workflows */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={6}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">6. Service Quotes & Payment Hold</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">6.1 Service Providers (Artists, Frame Shops, etc.)</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    When buyers accept a quote for services, payment is held by Stripe but NOT released to the vendor until:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Work is marked as complete by the vendor, AND</li>
                    <li>• Buyer confirms receipt and satisfaction</li>
                  </ul>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="text-sm text-green-900 dark:text-green-300">
                    <strong>Payment Security:</strong> Funds are held securely and only released once work is completed to protect both parties.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 7. Refunds & Disputes */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={7}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">7. Refunds & Dispute Resolution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">7.1 Vendor Refund Policy</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Vendors establish their own refund and return policies. Credabilia facilitates but does not mandate refunds.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">7.2 Dispute Process</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    For disputes:
                  </p>
                  <ol className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4 list-decimal">
                    <li>Contact the vendor directly</li>
                    <li>If unresolved, contact Credabilia support</li>
                    <li>Credabilia may facilitate communication but is not liable for resolution</li>
                    <li>Stripe's chargeback process may apply if applicable</li>
                  </ol>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">7.3 Processing Fees</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Stripe processing fees are typically not recoverable in refunds. The Platform fee (12%) may or may not be refunded depending on the circumstances and vendor policy.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 8. Prohibited Activities */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={8}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">8. Prohibited Activities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Users are prohibited from:
                </p>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 ml-4">
                  <li>• Listing counterfeit, stolen, or prohibited items</li>
                  <li>• Misrepresenting item authenticity or condition</li>
                  <li>• Manipulating auditor votes or community ratings</li>
                  <li>• Engaging in fraud, scams, or deception</li>
                  <li>• Using the Platform for illegal purposes</li>
                  <li>• Harassing, threatening, or abusing other users</li>
                  <li>• Circumventing platform fees or payment systems</li>
                  <li>• Violating intellectual property or trademark rights</li>
                </ul>
              </CardContent>
            </Card>
          </motion.section>

          {/* 9. Account Suspension */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={9}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">9. Account Suspension & Termination</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Credabilia reserves the right to suspend or terminate user accounts for:
                </p>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 ml-4">
                  <li>• Violation of these Terms</li>
                  <li>• Fraudulent activity</li>
                  <li>• Repeated complaints or disputes</li>
                  <li>• Listing prohibited items</li>
                  <li>• Suspicious or abusive behavior</li>
                </ul>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-4">
                  Suspended accounts may lose access to Credion Credits and pending transactions.
                </p>
              </CardContent>
            </Card>
          </motion.section>

          {/* 10. Limitation of Liability */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={10}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">10. Limitation of Liability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm text-red-900 dark:text-red-300 font-semibold mb-2">
                    Credabilia is not liable for:
                  </p>
                  <ul className="space-y-1 text-sm text-red-900 dark:text-red-300 ml-4">
                    <li>• Item authenticity, condition, or quality</li>
                    <li>• Transaction outcomes or disputes</li>
                    <li>• Shipping delays or carrier issues</li>
                    <li>• Seller fraud or misrepresentation</li>
                    <li>• Data loss or system outages</li>
                    <li>• Third-party integrations (Stripe, Shippo, etc.)</li>
                    <li>• Any indirect or consequential damages</li>
                  </ul>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                   <strong>Use of this Platform is at your own risk.</strong> Credabilia makes no warranties, express or implied, regarding the Platform or its contents. Credabilia's liability is limited to the amount paid as platform fees for the transaction in question.
                </p>
              </CardContent>
            </Card>
          </motion.section>

          {/* 11. Dispute Resolution */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={11}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">11. Dispute Resolution & Governing Law</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                   <h4 className="font-semibold text-gray-900 dark:text-white mb-2">11.1 Governing Law</h4>
                   <p className="text-sm text-gray-700 dark:text-gray-300">
                     These Terms are governed by and construed in accordance with the laws of the State of Nevada, USA, without regard to conflict of law principles. Any action or proceeding shall be brought exclusively in the state or federal courts located in Nevada.
                   </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">11.2 Dispute Resolution</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Any disputes shall be resolved through good-faith negotiation. If unresolved, disputes may proceed to binding arbitration or court proceedings as applicable by law.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 12. Changes to Terms */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={12}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">12. Changes to Terms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Credabilia reserves the right to modify these Terms at any time. Continued use of the Platform constitutes acceptance of updated Terms. We will notify users of material changes via email or in-app notification.
                </p>
              </CardContent>
            </Card>
          </motion.section>

          {/* Contact */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={13}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Contact Us</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  For questions about these Terms, contact us at:
                </p>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-sm font-mono text-gray-900 dark:text-white">
                    KingCredion@credabilia.com
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.section>
        </div>

        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={14}
          className="mt-12 pt-8 border-t dark:border-gray-800 text-center text-sm text-gray-600 dark:text-gray-400"
        >
          <p>© 2026 Credabilia. All rights reserved.</p>
        </motion.div>
      </div>
    </motion.div>
  );
}