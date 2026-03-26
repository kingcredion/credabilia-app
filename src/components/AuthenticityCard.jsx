import React, { useState } from "react";
import { ShieldCheck, AlertCircle, ShieldX, FileCheck, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const tabs = ["Score", "Verdict", "Auth & COA"];

export default function AuthenticityCard({ item, totalVotes, authenticVotes, suspiciousVotes, counterfeitVotes }) {
  const [activeTab, setActiveTab] = useState("Score");
  const [showAllCoa, setShowAllCoa] = useState(false);

  const score = item?.authenticity_meter || 50;

  const scoreColor =
    score >= 80 ? { text: "text-green-600", bg: "bg-green-500", light: "bg-green-50 border-green-200", label: "Highly Credible" } :
    score >= 60 ? { text: "text-yellow-600", bg: "bg-yellow-400", light: "bg-yellow-50 border-yellow-200", label: "Moderately Credible" } :
    { text: "text-red-600", bg: "bg-red-500", light: "bg-red-50 border-red-200", label: "Low Credibility" };

  const coaCerts = item?.coa_certificates || [];
  const displayedCerts = showAllCoa ? coaCerts : coaCerts.slice(0, 1);

  return (
    <Card className="border border-gray-200 shadow-sm overflow-hidden">
      {/* Tab Bar */}
      <div className="flex border-b border-gray-100 bg-gray-50">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-medium transition-all ${
              activeTab === tab
                ? "border-b-2 border-blue-600 text-blue-600 bg-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <CardContent className="p-4">
        {/* SCORE TAB */}
        {activeTab === "Score" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Credible Buy Meter™</p>
                <p className={`text-sm font-semibold ${scoreColor.text}`}>{scoreColor.label}</p>
              </div>
              <div className={`text-2xl font-black px-3 py-1 rounded-lg border ${scoreColor.light} ${scoreColor.text}`}>
                {score}%
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>0</span><span>50</span><span>100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${scoreColor.bg}`}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="bg-gray-50 rounded-lg p-2 text-center border border-gray-100">
                <p className="text-[10px] text-gray-500">Authentic</p>
                <p className={`text-lg font-bold ${scoreColor.text}`}>
                  {totalVotes > 0 ? Math.round((authenticVotes / totalVotes) * 100) : 0}%
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center border border-gray-100">
                <p className="text-[10px] text-gray-500">Score</p>
                <p className={`text-lg font-bold ${scoreColor.text}`}>{score}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center border border-gray-100">
                <p className="text-[10px] text-gray-500">Votes</p>
                <p className={`text-lg font-bold ${scoreColor.text}`}>{totalVotes}</p>
              </div>
            </div>
          </div>
        )}

        {/* VERDICT TAB */}
        {activeTab === "Verdict" && (
          <div className="space-y-3">
            {totalVotes === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No expert reviews yet.</p>
            ) : (
              <>
                {[
                  { label: "Authentic", count: authenticVotes, icon: <ShieldCheck className="w-4 h-4 text-green-600" />, color: "bg-green-500" },
                  { label: "Suspicious", count: suspiciousVotes, icon: <AlertCircle className="w-4 h-4 text-yellow-500" />, color: "bg-yellow-400" },
                  { label: "Counterfeit", count: counterfeitVotes, icon: <ShieldX className="w-4 h-4 text-red-600" />, color: "bg-red-500" },
                ].map(({ label, count, icon, color }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {icon}
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <span className="text-sm font-semibold">{count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`${color} h-1.5 rounded-full transition-all`}
                        style={{ width: totalVotes > 0 ? `${(count / totalVotes) * 100}%` : "0%" }}
                      />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* AUTH & COA COMBINED TAB */}
        {activeTab === "Auth & COA" && (
          <div className="flex gap-3">
            {/* COA image on the left */}
            {coaCerts.length > 0 && (
              <a
                href={coaCerts[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-orange-200 hover:border-orange-400 transition-all group relative"
              >
                <img src={coaCerts[0]} alt="COA" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center">
                  <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </a>
            )}
            {/* Auth details on the right */}
            <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-2">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Authenticator</p>
                <p className="text-xs font-semibold text-gray-900">{item?.authenticator || "Not specified"}</p>
              </div>
              {item?.certificate_id && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Certificate ID</p>
                  <p className="text-xs font-semibold text-gray-900 font-mono truncate">{item.certificate_id}</p>
                </div>
              )}
              {item?.grading_company && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Grading Co.</p>
                  <p className="text-xs font-semibold text-gray-900">{item.grading_company}</p>
                </div>
              )}
              {item?.grade_value && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Grade</p>
                  <p className="text-xs font-semibold text-blue-600">{item.grade_value}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}