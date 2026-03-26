import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronDown, 
  ChevronUp, 
  Scale, 
  ShieldCheck, 
  AlertCircle,
  Calendar,
  Trophy,
  Users,
  Mail,
  FileText
} from "lucide-react";

export default function SweepstakesRules() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="border-2 border-blue-500/30 dark:border-blue-500/20 bg-card dark:bg-white/[0.04] shadow-lg dark:shadow-xl">
      <CardHeader className="cursor-pointer hover:bg-blue-500/5 dark:hover:bg-blue-900/10 transition-colors" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-xl text-foreground">
            <Scale className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Official Sweepstakes Rules
            <Badge variant="outline" className="text-xs dark:border-blue-500/40 dark:text-blue-400">Legal</Badge>
          </CardTitle>
          <Button variant="ghost" size="icon" className="text-foreground/70 hover:text-foreground">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Click to view complete terms and conditions
        </p>
      </CardHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CardContent className="space-y-6 pt-6">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 dark:from-blue-700 to-purple-600 dark:to-purple-700 text-white rounded-xl p-6">
                <h2 className="text-2xl font-bold mb-2">Credabilia 1M User Sweepstakes</h2>
                <p className="text-blue-100 dark:text-blue-200 text-sm">
                  NO PURCHASE NECESSARY. VOID IN NEW YORK, FLORIDA, AND RHODE ISLAND.
                </p>
              </div>

              {/* Sponsor */}
              <div className="bg-muted/50 dark:bg-blue-900/15 rounded-lg p-4 border border-blue-500/20">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-foreground mb-1">Sponsor</h3>
                    <p className="text-sm text-muted-foreground">
                      <strong>Credabilia</strong> / Credabilia.com
                    </p>
                  </div>
                </div>
              </div>

              {/* Eligibility */}
              <div className="bg-yellow-500/10 dark:bg-yellow-900/20 border-2 border-yellow-500/30 dark:border-yellow-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-bold text-foreground mb-2">Eligibility</h3>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-600 dark:text-yellow-400 font-bold">•</span>
                        <span>Open to legal U.S. residents <strong>age 18 or older</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-600 dark:text-yellow-400 font-bold">•</span>
                        <span><strong>VOID in New York, Florida, and Rhode Island</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-600 dark:text-yellow-400 font-bold">•</span>
                        <span>Employees of Credabilia and immediate family members are not eligible</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Sweepstakes Period */}
              <div className="bg-purple-500/10 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-500/20 dark:border-purple-500/20">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-bold text-foreground mb-2">Sweepstakes Period</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div>
                        <p className="font-semibold text-purple-700 dark:text-purple-300">Start Date:</p>
                        <p>Immediately upon availability of user registration on Credabilia.com</p>
                      </div>
                      <div>
                        <p className="font-semibold text-purple-700 dark:text-purple-300">End Date:</p>
                        <p>When Credabilia reaches <strong>1,000,000 registered users</strong></p>
                      </div>
                      <div className="bg-muted/60 dark:bg-muted/30 rounded p-3 border border-purple-500/20 mt-3">
                        <p className="text-xs text-purple-700 dark:text-purple-300">
                          <strong>Note:</strong> If 1,000,000 users is not reached by December 31, 2027, 
                          a winner will be selected from all eligible entries received by that date.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* How to Enter */}
              <div className="bg-green-500/10 dark:bg-green-900/20 rounded-lg p-4 border border-green-500/20">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-bold text-foreground mb-2">How to Enter</h3>
                    
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <div>
                        <p className="font-semibold text-green-700 dark:text-green-300 mb-1">Primary Entry Method (Online):</p>
                        <ul className="space-y-1 ml-4">
                          <li className="flex items-start gap-2">
                            <span className="text-green-600 dark:text-green-400 font-bold">1.</span>
                            <span>Create a free account at <strong>Credabilia.com</strong></span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-green-600 font-bold">2.</span>
                            <span>Complete the registration process</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-green-600 font-bold">3.</span>
                            <span>You are automatically entered — <strong>ONE (1) entry per person</strong></span>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-muted/60 dark:bg-muted/30 rounded p-3 border border-green-500/20">
                        <p className="font-semibold text-green-700 dark:text-green-300 mb-1">Alternate Entry Method (Mail-in):</p>
                        <p className="text-xs text-muted-foreground mb-2">
                          To enter without registering online, mail a 3x5 postcard with your name, 
                          email address, phone number, and mailing address to:
                        </p>
                        <div className="bg-muted rounded p-2 font-mono text-xs text-foreground">
                          Credabilia Sweepstakes<br />
                          [MAILING ADDRESS TO BE PROVIDED]<br />
                          Attn: 1M User Sweepstakes
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Limit one mail-in entry per person. Mail-in entries must be postmarked 
                          before the sweepstakes end date.
                        </p>
                      </div>

                      <div className="bg-red-500/10 dark:bg-red-900/20 border border-red-500/30 rounded p-3">
                        <p className="text-xs text-red-700 dark:text-red-400">
                          <strong>⚠️ Important:</strong> NO PURCHASE NECESSARY TO ENTER OR WIN. 
                          A purchase will not increase your chances of winning.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Prize Details */}
              <div className="bg-orange-500/10 dark:bg-orange-900/20 border-2 border-orange-500/30 dark:border-orange-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Trophy className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-bold text-foreground mb-2">Prize</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>
                        <strong>One (1) Grand Prize:</strong> Authenticated Michael Jordan Signed Jersey
                      </p>
                      <p>
                        <strong>Approximate Retail Value (ARV):</strong> $25,000 USD
                      </p>
                      <p className="text-xs text-orange-700 dark:text-orange-300 bg-muted/60 dark:bg-muted/30 rounded p-2 border border-orange-500/20 mt-3">
                        <strong>Prize Substitution:</strong> Sponsor reserves the right to substitute a prize 
                        of equal or greater value if the advertised prize becomes unavailable.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Winner Selection */}
              <div className="bg-blue-500/10 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-500/20">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-bold text-foreground mb-2">Winner Selection</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 dark:text-blue-400 font-bold">•</span>
                        <span><strong>Random Drawing:</strong> One (1) winner will be selected via random drawing from all eligible entries</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span><strong>Drawing Date:</strong> Within seven (7) days of Credabilia reaching 1,000,000 registered users</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span><strong>Odds:</strong> Depend on total number of eligible entries received (maximum 1:1,000,000)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Winner Notification */}
              <div className="bg-green-500/10 dark:bg-green-900/20 rounded-lg p-4 border border-green-500/20">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-bold text-foreground mb-2">Winner Notification</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 dark:text-green-400 font-bold">•</span>
                        <span>Winner will be notified via <strong>email</strong> at the address associated with their account</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 font-bold">•</span>
                        <span>Public announcement will be made on the Credabilia platform</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 font-bold">•</span>
                        <span>Winner must respond within <strong>14 days</strong> to claim prize</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 font-bold">•</span>
                        <span>If winner does not respond, an alternate winner will be selected</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Taxes & Fees */}
              <div className="bg-red-500/10 dark:bg-red-900/20 border-2 border-red-500/30 dark:border-red-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-bold text-foreground mb-2">Taxes & Fees</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-red-600 dark:text-red-400 font-bold">•</span>
                        <span><strong>Winner is solely responsible for all federal, state, and local taxes</strong> on the prize value</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-600 font-bold">•</span>
                        <span>IRS Form 1099-MISC will be issued for prizes valued at $600 or more</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-600 font-bold">•</span>
                        <span>Winner may be required to complete affidavit of eligibility and tax forms before receiving prize</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* General Terms */}
              <div className="space-y-4">
                <h3 className="font-bold text-foreground text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  General Terms & Conditions
                </h3>

                <div className="prose prose-sm dark:prose-invert text-muted-foreground space-y-3 text-sm leading-relaxed">
                  <p>
                    <strong>1. Agreement to Official Rules:</strong> By entering, you agree to be bound by these 
                    Official Rules and the decisions of Sponsor, which are final and binding in all respects.
                  </p>

                  <p>
                    <strong>2. License Grant:</strong> By entering, you grant Sponsor the right to use your name, 
                    likeness, and entry materials for promotional purposes without additional compensation, except 
                    where prohibited by law.
                  </p>

                  <p>
                    <strong>3. Privacy:</strong> Information collected is subject to Sponsor's Privacy Policy. 
                    By entering, you consent to Sponsor's collection and use of your personal information.
                  </p>

                  <p>
                    <strong>4. Disqualification:</strong> Sponsor reserves the right to disqualify any entrant 
                    for: (a) tampering with the entry process, (b) violating these Official Rules, (c) creating 
                    multiple accounts, or (d) acting in an unsportsmanlike or disruptive manner.
                  </p>

                  <p>
                    <strong>5. Limitation of Liability:</strong> By entering, you release and hold harmless 
                    Sponsor, its affiliates, and their respective officers, directors, employees, and agents 
                    from any and all liability for any injuries, losses, or damages of any kind arising from 
                    participation in this sweepstakes or acceptance/use of the prize.
                  </p>

                  <p>
                    <strong>6. Disputes:</strong> Except where prohibited, all issues and questions concerning the 
                    construction, validity, interpretation, and enforceability of these Official Rules shall be 
                    governed by the laws of [STATE TO BE DETERMINED], without giving effect to any choice of law rules.
                  </p>

                  <p>
                    <strong>7. Arbitration:</strong> Any controversy or claim arising out of or relating to this 
                    sweepstakes shall be settled by binding arbitration in accordance with the commercial arbitration 
                    rules of the American Arbitration Association.
                  </p>

                  <p>
                    <strong>8. Modifications:</strong> Sponsor reserves the right to cancel, suspend, or modify 
                    the sweepstakes if fraud, technical failures, or any other factor beyond Sponsor's control 
                    impairs the integrity or proper functioning of the sweepstakes.
                  </p>

                  <p>
                    <strong>9. Prize Delivery:</strong> Prize will be awarded "as is" with no warranty or guarantee, 
                    either express or implied. Winner is responsible for all applicable shipping costs and insurance 
                    if desired.
                  </p>

                  <p>
                    <strong>10. Verification:</strong> Potential winner may be required to provide proof of identity 
                    and eligibility. Failure to provide required documentation within the specified time period may 
                    result in disqualification.
                  </p>
                </div>
              </div>

              {/* Disclaimers */}
              <div className="bg-muted/50 dark:bg-amber-900/15 border-2 border-amber-500/30 dark:border-amber-500/20 rounded-lg p-4">
                <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  Important Disclaimers
                </h3>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    • Sponsor is not responsible for: (a) lost, late, incomplete, or misdirected entries; 
                    (b) telephone, electronic, hardware, or software program, network, Internet, or computer malfunctions or failures.
                  </p>
                  <p>
                    • Prize is non-transferable and no cash equivalent or prize substitution allowed except at Sponsor's sole discretion.
                  </p>
                  <p>
                    • Winner agrees to allow Sponsor to use their name and likeness for promotional purposes without additional compensation.
                  </p>
                  <p>
                    • If winner is found to be ineligible or in violation of these rules, prize will be forfeited and awarded to an alternate winner.
                  </p>
                  <p>
                    • Credabilia is not affiliated with or endorsed by Michael Jordan, the NBA, or any specific sports organization.
                  </p>
                </div>
              </div>

              {/* Winners List */}
              <div className="bg-blue-500/10 dark:bg-blue-900/20 rounded-lg p-4 text-center border border-blue-500/20">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Winners List:</strong> For the name of the winner (available after winner announcement), 
                  send a self-addressed stamped envelope to: Credabilia Sweepstakes Winner Request, 
                  [ADDRESS TO BE PROVIDED]
                </p>
              </div>

              {/* Footer */}
              <div className="text-center pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Last Updated: November 2025 | Subject to change with notice
                </p>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}