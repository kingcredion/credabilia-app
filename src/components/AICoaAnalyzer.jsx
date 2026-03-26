import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Loader2,
  Eye,
  ShieldCheck,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AICoaAnalyzer({ 
  coaCertificates, 
  certificateId, 
  authenticator,
  onAnalysisComplete 
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Reset analysis when inputs change
    if (coaCertificates.length > 0 && authenticator) {
      setAnalysis(null);
    }
  }, [coaCertificates, authenticator]);

  const analyzeCOA = async () => {
    if (coaCertificates.length === 0) return;
    
    setAnalyzing(true);
    
    try {
      // Analyze COA images with AI
      const analysisPrompt = `You are an expert authenticator analyzing a Certificate of Authenticity (COA) for sports memorabilia.

Authentication Company: ${authenticator}
Certificate ID: ${certificateId || "Not provided"}

Analyze the provided COA certificate image(s) for authenticity markers and potential red flags.

Check for:
1. Company logo quality and authenticity
2. Hologram or security features visibility
3. Certificate format and professional appearance
4. Certificate ID format (if visible in image)
5. Signature or stamp authenticity
6. Print quality and paper type
7. Any signs of tampering or forgery
8. Item dimensions if visible (length x width x height)

Provide your assessment in JSON format:
{
  "confidence_score": 0-100 (integer),
  "status": "authentic" | "suspicious" | "counterfeit",
  "red_flags": ["array", "of", "issues"],
  "green_flags": ["array", "of", "positive", "signs"],
  "certificate_id_valid": true/false,
  "recommendations": "string with recommendations for vendor",
  "dimensions": {
    "length": number or null,
    "width": number or null,
    "height": number or null,
    "unit": "in" or "cm" or null
  }
}`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: analysisPrompt,
        file_urls: coaCertificates,
        response_json_schema: {
          type: "object",
          properties: {
            confidence_score: { type: "integer" },
            status: { type: "string" },
            red_flags: { type: "array", items: { type: "string" } },
            green_flags: { type: "array", items: { type: "string" } },
            certificate_id_valid: { type: "boolean" },
            recommendations: { type: "string" },
            dimensions: {
              type: "object",
              properties: {
                length: { type: ["number", "null"] },
                width: { type: ["number", "null"] },
                height: { type: ["number", "null"] },
                unit: { type: ["string", "null"] }
              }
            }
          }
        }
      });

      // Additional validation for certificate ID format
      let idValidation = null;
      if (certificateId) {
        const idCheckPrompt = `Verify if this certificate ID follows the standard format for ${authenticator}:
Certificate ID: ${certificateId}

Common formats:
- PSA/DNA: PSA followed by 8 digits (e.g., PSA12345678)
- JSA: JSA followed by letters and numbers (e.g., JSA-AB12345)
- Beckett: BA, BB, BG followed by numbers
- SGC: SGC followed by numbers

Is this format valid and typical? Response as JSON:
{
  "format_valid": true/false,
  "format_notes": "string explaining the assessment"
}`;

        idValidation = await base44.integrations.Core.InvokeLLM({
          prompt: idCheckPrompt,
          response_json_schema: {
            type: "object",
            properties: {
              format_valid: { type: "boolean" },
              format_notes: { type: "string" }
            }
          }
        });
      }

      const finalAnalysis = {
        ...result,
        id_validation: idValidation,
        analyzed_at: new Date().toISOString()
      };

      setAnalysis(finalAnalysis);
      onAnalysisComplete && onAnalysisComplete(finalAnalysis);
      
    } catch (error) {
      console.error("Error analyzing COA:", error);
      setAnalysis({
        confidence_score: 50,
        status: "error",
        red_flags: ["Unable to complete AI analysis"],
        green_flags: [],
        certificate_id_valid: false,
        recommendations: "Please manually review the COA. AI analysis failed."
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'authentic': return { bg: '#10b981', light: '#d1fae5', text: '#065f46' };
      case 'suspicious': return { bg: '#f59e0b', light: '#fef3c7', text: '#92400e' };
      case 'counterfeit': return { bg: '#ef4444', light: '#fee2e2', text: '#991b1b' };
      default: return { bg: '#6b7280', light: '#f3f4f6', text: '#374151' };
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'authentic': return <CheckCircle2 className="w-6 h-6" />;
      case 'suspicious': return <AlertTriangle className="w-6 h-6" />;
      case 'counterfeit': return <XCircle className="w-6 h-6" />;
      default: return <Sparkles className="w-6 h-6" />;
    }
  };

  if (coaCertificates.length === 0) return null;

  const statusColor = analysis ? getStatusColor(analysis.status) : null;

  return (
    <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-purple-900">
          <Sparkles className="w-5 h-5" />
          AI COA Verification Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!analysis && !analyzing && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">
              Get AI-Powered COA Verification
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Our AI will analyze your certificate images, verify the certificate ID format,
              and check for authenticity markers before listing.
            </p>
            <Button
              onClick={analyzeCOA}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze COA
            </Button>
          </div>
        )}

        {analyzing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            <Loader2 className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">
              Analyzing Your COA...
            </h3>
            <p className="text-sm text-gray-600">
              AI is examining certificate images and validating details
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
              <Eye className="w-4 h-4 animate-pulse" />
              <span>Checking security features...</span>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {analysis && !analyzing && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Overall Assessment */}
              <div 
                className="rounded-lg p-4 border-2"
                style={{ 
                  backgroundColor: statusColor.light,
                  borderColor: statusColor.bg,
                  color: statusColor.text
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="p-2 rounded-full"
                      style={{ backgroundColor: statusColor.bg, color: 'white' }}
                    >
                      {getStatusIcon(analysis.status)}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg capitalize">
                        {analysis.status === 'error' ? 'Analysis Error' : `${analysis.status} Assessment`}
                      </h3>
                      <p className="text-sm opacity-75">AI Confidence Analysis</p>
                    </div>
                  </div>
                  <Badge 
                    className="text-xl px-4 py-2"
                    style={{ backgroundColor: statusColor.bg, color: 'white' }}
                  >
                    {analysis.confidence_score}%
                  </Badge>
                </div>

                {/* Certificate ID Validation */}
                {analysis.id_validation && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: `${statusColor.bg}40` }}>
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold mb-1">Certificate ID Format:</p>
                        <p className="text-xs opacity-90">{analysis.id_validation.format_notes}</p>
                        {!analysis.id_validation.format_valid && (
                          <Badge className="mt-2 bg-red-600 text-white text-xs">
                            ⚠️ Unusual Format
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Toggle Details */}
              <Button
                variant="outline"
                onClick={() => setShowDetails(!showDetails)}
                className="w-full"
              >
                {showDetails ? 'Hide' : 'Show'} Detailed Analysis
              </Button>

              {/* Detailed Analysis */}
              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Red Flags */}
                    {analysis.red_flags && analysis.red_flags.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                          <XCircle className="w-4 h-4" />
                          Potential Issues ({analysis.red_flags.length})
                        </h4>
                        <ul className="space-y-1">
                          {analysis.red_flags.map((flag, idx) => (
                            <li key={idx} className="text-sm text-red-800 flex items-start gap-2">
                              <span className="text-red-600 mt-1">•</span>
                              <span>{flag}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Green Flags */}
                    {analysis.green_flags && analysis.green_flags.length > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          Positive Signs ({analysis.green_flags.length})
                        </h4>
                        <ul className="space-y-1">
                          {analysis.green_flags.map((flag, idx) => (
                            <li key={idx} className="text-sm text-green-800 flex items-start gap-2">
                              <span className="text-green-600 mt-1">✓</span>
                              <span>{flag}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommendations */}
                    {analysis.recommendations && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4" />
                          Recommendations
                        </h4>
                        <p className="text-sm text-blue-800 leading-relaxed">
                          {analysis.recommendations}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Disclaimer */}
              <div className="text-xs text-gray-500 text-center p-3 bg-gray-50 rounded-lg">
                <p className="mb-1">
                  ⚠️ AI analysis is for guidance only. Your listing will still undergo community vetting.
                </p>
                <p>
                  Final authenticity score will be determined by expert vettors.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}