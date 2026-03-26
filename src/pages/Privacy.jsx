import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const sectionVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.4 } })
};

export default function Privacy() {
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
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-5xl font-bold text-gray-900 dark:text-white">
              Privacy Policy
            </h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-2">
            Effective: {lastUpdated}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Last updated: {lastUpdated}
          </p>
        </motion.div>

        <div className="space-y-8">
          {/* Introduction */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={0}>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Credabilia ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Platform.
                </p>
              </CardContent>
            </Card>
          </motion.section>

          {/* 1. Information We Collect */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={1}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">1. Information We Collect</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.1 Account Information</h4>
                  <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Full name and email address</li>
                    <li>• Password and authentication credentials</li>
                    <li>• Profile information (bio, interests, location)</li>
                    <li>• Shipping and billing addresses</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.2 Transaction Information</h4>
                  <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Purchase history and order details</li>
                    <li>• Payment method information (processed by Stripe)</li>
                    <li>• Shipping tracking and fulfillment data</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.3 Usage Data</h4>
                  <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Browsing activity and pages visited</li>
                    <li>• Items viewed, liked, or bookmarked</li>
                    <li>• Searches performed on the Platform</li>
                    <li>• Device information (IP address, browser type)</li>
                    <li>• Cookies and tracking pixels</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1.4 Content & Communication</h4>
                  <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 ml-4">
                    <li>• Messages between users</li>
                    <li>• Item listings and descriptions</li>
                    <li>• Photos and media uploaded</li>
                    <li>• Customer support interactions</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 2. How We Use Your Information */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={2}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">2. How We Use Your Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 ml-4">
                  <li>• <strong>Platform functionality:</strong> Process transactions, facilitate communication, and manage accounts</li>
                  <li>• <strong>Personalization:</strong> Customize your feed, recommendations, and user experience</li>
                  <li>• <strong>Analytics:</strong> Analyze usage patterns to improve the Platform</li>
                  <li>• <strong>Communication:</strong> Send order updates, account notifications, and support responses</li>
                  <li>• <strong>Safety & Security:</strong> Prevent fraud, abuse, and enforce our Terms</li>
                  <li>• <strong>Marketing:</strong> Send promotional emails and newsletters (you can opt-out)</li>
                  <li>• <strong>Legal Compliance:</strong> Comply with laws, regulations, and legal requests</li>
                </ul>
              </CardContent>
            </Card>
          </motion.section>

          {/* 3. Third-Party Services */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={3}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">3. Third-Party Services</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  We share information with trusted third parties to operate the Platform:
                </p>
                <div className="space-y-3 mt-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Stripe (Payment Processing)</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Payment information is processed by Stripe. We do not store full credit card numbers. See Stripe's privacy policy at stripe.com/privacy.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Shippo (Shipping Integration)</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Shipping and address information is shared with Shippo for label generation and tracking.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Google Services</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      We use Google Analytics for usage tracking and Google Places for location autocomplete.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Communication Services</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Klaviyo for email marketing and Resend for transactional emails.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.section>

          {/* 4. Cookies & Tracking */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={4}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">4. Cookies & Tracking Technologies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  We use cookies, pixels, and similar tracking technologies to:
                </p>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 ml-4 mt-3">
                  <li>• Remember login information and preferences</li>
                  <li>• Analyze site usage and traffic</li>
                  <li>• Serve personalized content and ads</li>
                  <li>• Detect and prevent fraud</li>
                </ul>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-4">
                  You can manage cookie preferences through your browser settings. Some Platform features may not function properly if cookies are disabled.
                </p>
              </CardContent>
            </Card>
          </motion.section>

          {/* 5. User Rights */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={5}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">5. Your Privacy Rights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Depending on your location, you may have the following rights:
                </p>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 ml-4 mt-3">
                  <li>• <strong>Access:</strong> Request a copy of the personal information we hold about you</li>
                  <li>• <strong>Correction:</strong> Request corrections to inaccurate data</li>
                  <li>• <strong>Deletion:</strong> Request deletion of your account and associated data</li>
                  <li>• <strong>Opt-Out:</strong> Opt out of marketing communications and non-essential cookies</li>
                  <li>• <strong>Data Portability:</strong> Request your data in a portable format</li>
                </ul>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-4">
                  To exercise any of these rights, contact us at KingCredion@credabilia.com with proof of identity.
                </p>
              </CardContent>
            </Card>
          </motion.section>

          {/* 6. Data Retention */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={6}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">6. Data Retention</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  We retain your information for as long as necessary to provide the Platform and comply with legal obligations. Generally:
                </p>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 ml-4 mt-3">
                  <li>• Account data is retained until account closure + 7 years (for audit and legal purposes)</li>
                  <li>• Transaction data is retained for 7 years (tax and legal compliance)</li>
                  <li>• Analytics data is retained for 24 months</li>
                  <li>• Cookies expire based on their type and your preferences</li>
                </ul>
              </CardContent>
            </Card>
          </motion.section>

          {/* 7. Data Security */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={7}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">7. Data Security</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  We implement industry-standard security measures to protect your information, including:
                </p>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 ml-4 mt-3">
                  <li>• SSL/TLS encryption for data in transit</li>
                  <li>• Secure password storage with hashing</li>
                  <li>• Restricted access to sensitive data</li>
                  <li>• Regular security audits and updates</li>
                </ul>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-4">
                  However, no security system is impenetrable. We encourage you to use strong passwords and protect your login credentials.
                </p>
              </CardContent>
            </Card>
          </motion.section>

          {/* 8. Contact Us */}
          <motion.section variants={sectionVariants} initial="hidden" animate="visible" custom={8}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">8. Contact Us</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  For privacy inquiries, data requests, or concerns, contact:
                </p>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mt-4">
                  <p className="text-sm font-mono text-gray-900 dark:text-white">
                    KingCredion@credabilia.com
                  </p>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-4">
                  We will respond to data subject requests within 30 days.
                </p>
              </CardContent>
            </Card>
          </motion.section>
        </div>

        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={9}
          className="mt-12 pt-8 border-t dark:border-gray-800 text-center text-sm text-gray-600 dark:text-gray-400"
        >
          <p>© 2026 Credabilia. All rights reserved.</p>
        </motion.div>
      </div>
    </motion.div>
  );
}