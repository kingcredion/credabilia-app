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

export default function RefundPolicy() {
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
            Refund & Dispute Policy
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-2">
            Effective: {lastUpdated}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Last updated: {lastUpdated}
          </p>
        </motion.div>

        <div className="space-y-8">
          {/* Overview */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={0}>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white mb-1">
                        Vendor-Controlled Refunds
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Credabilia does not control refund decisions. Each vendor sets their own refund policy. This policy outlines how disputes are handled and what Credabilia's role is.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 1. Vendor Responsibility */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={1}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">1. Vendor Refund Policy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.1 Vendor Controls Refunds</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Each vendor independently sets and controls their refund policy. Before purchase, carefully review the vendor's stated policy in the listing or contact them directly.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.2 Policy Variations</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Refund policies may include:
                  </p>
                  <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• No refunds (as-is sales)</li>
                    <li>• 30-day return window</li>
                    <li>• Return shipping must be paid by buyer</li>
                    <li>• Restocking fees</li>
                    <li>• Condition-based refund eligibility</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.3 No Default Platform Policy</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Credabilia does not mandate a refund policy. If a vendor has not stated a policy, assume the sale is final.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 2. Dispute Process */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={2}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">2. Dispute Resolution Process</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
               <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Dispute Process Overview:</p>
                  <p className="text-sm text-blue-900 dark:text-blue-300">
                    Submit a dispute → Vendor responds → Credabilia reviews (if needed) → Resolution or escalation
                  </p>
               </div>
               <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Step 1: Contact the Vendor Directly</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    If you have an issue with an order, contact the vendor first via the messaging system. Provide:
                  </p>
                  <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4 mt-2">
                    <li>• Order number and date</li>
                    <li>• Photos or evidence of the issue</li>
                    <li>• Clear description of the problem</li>
                    <li>• Your requested resolution</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Step 2: Wait for Vendor Response</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Allow the vendor up to 7 business days to respond. Many disputes are resolved directly at this stage.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Step 3: Escalate to Credabilia (if needed)</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    If the vendor doesn't respond or you cannot reach an agreement, contact Credabilia support:
                  </p>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 mt-2">
                    <p className="text-sm font-mono text-gray-900 dark:text-white">
                      KingCredion@credabilia.com
                    </p>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                    Include all prior communication and evidence with your support request.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Step 4: Stripe Chargeback (Last Resort)</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    If unresolved, you may dispute the charge with your payment provider (Stripe) or credit card company. Chargebacks carry significant costs and may result in vendor account suspension.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 3. Refund Ineligibility */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={3}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">3. Common Refund Ineligibility</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                  Even if you request a refund, vendors may deny it based on:
                </p>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 ml-4">
                  <li>• <strong>Change of mind:</strong> The item works as described but you no longer want it</li>
                  <li>• <strong>Missing return window:</strong> You requested a refund outside the stated timeframe</li>
                  <li>• <strong>Item damage:</strong> The item was damaged due to buyer mishandling or improper care</li>
                  <li>• <strong>Lack of evidence:</strong> You cannot prove the item was different than described</li>
                  <li>• <strong>As-is policy:</strong> The vendor sold the item "as-is" with no returns</li>
                  <li>• <strong>Missing documentation:</strong> You cannot provide tracking or proof of return</li>
                </ul>
              </CardContent>
            </Card>
          </motion.section>

          {/* 4. Special Cases */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={4}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">4. Special Refund Cases</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">4.1 Service Quotes & Escrow</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    For service quotes (framing, commissions, custom work), payment is held until work is complete. Refunds are handled per the service agreement and vendor policy.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">4.2 Counterfeit or Prohibited Items</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    If you receive an item that is:
                  </p>
                  <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4 mt-2">
                    <li>• Counterfeit or fraudulent</li>
                    <li>• Stolen or illegal</li>
                    <li>• Completely misrepresented (different item sent)</li>
                  </ul>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                    Contact Credabilia immediately. These cases may result in full refunds + vendor account termination.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">4.3 Non-Arrival</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    If an item never arrives:
                  </p>
                  <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4 mt-2">
                    <li>• Ask the vendor to file a carrier claim</li>
                    <li>• Request insurance refund if applicable</li>
                    <li>• Use Stripe/credit card dispute if needed</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 5. Processing Fees */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={5}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">5. Processing Fees & Refund Deductions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <p className="text-sm text-amber-900 dark:text-amber-300 font-semibold mb-2">
                    Stripe Processing Fees Are Non-Refundable
                  </p>
                  <p className="text-sm text-amber-900 dark:text-amber-300">
                    When you receive a refund, Stripe's processing fees (typically 2.9% + $0.30) are NOT recovered. Your refund amount is reduced by these processing costs.
                  </p>
                </div>
                <div className="mt-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Example</h4>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 space-y-1 text-sm text-gray-900 dark:text-gray-100">
                    <p>Sale Price: $100.00</p>
                    <p>Stripe Fee (2.9% + $0.30): $3.20</p>
                    <p>Credited to Vendor: $96.80</p>
                    <hr className="my-2 dark:border-gray-700" />
                    <p className="font-semibold">Refund Amount: $96.80 (not $100.00)</p>
                  </div>
                </div>
                <div className="mt-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Platform Fee Refunds</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    The Platform fee (12%) may or may not be refunded depending on the vendor's discretion and the reason for the refund.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 6. Credabilia's Role */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={6}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">6. What Credabilia Does (and Doesn't Do)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2 text-green-600 dark:text-green-400">Credabilia Will:</h4>
                  <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>✓ Facilitate communication between buyer and vendor</li>
                    <li>✓ Investigate reports of fraud or prohibited items</li>
                    <li>✓ Suspend accounts engaging in fraudulent activity</li>
                    <li>✓ Provide guidance on dispute resolution</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2 text-red-600 dark:text-red-400">Credabilia Will NOT:</h4>
                  <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>✗ Force vendors to issue refunds</li>
                    <li>✗ Decide disputes between buyer and vendor</li>
                    <li>✗ Take sides in authenticity disagreements</li>
                    <li>✗ Process refunds on behalf of vendors</li>
                    <li>✗ Guarantee resolution or compensation</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 7. Contact */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={7}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Questions About Refunds?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  For disputes, escalations, or questions about this policy, contact:
                </p>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mt-4">
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
          custom={8}
          className="mt-12 pt-8 border-t dark:border-gray-800 text-center text-sm text-gray-600 dark:text-gray-400"
        >
          <p>© 2026 Credabilia. All rights reserved.</p>
        </motion.div>
      </div>
    </motion.div>
  );
}