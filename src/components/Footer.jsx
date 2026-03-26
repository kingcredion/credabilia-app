import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Scale, Shield, FileText, Mail, Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "./contexts/LanguageContext";

export default function Footer() {
  const { language, setLanguage } = useLanguage();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gradient-to-r from-gray-900 via-gray-800 to-black text-gray-300 py-8 px-6 border-t-4 border-orange-500">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/46533c917_Photoroom_20251118_202357.png"
              alt="Credabilia"
              className="h-16 w-auto object-contain mb-4"
            />
            <p className="text-sm text-gray-400">
              Memorabilia & Fine Art Kingdom
            </p>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Scale className="w-4 h-4" />
              Legal
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to={createPageUrl("Terms")} className="hover:text-orange-400 transition-colors flex items-center gap-2">
                  <FileText className="w-3 h-3" />
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link to={createPageUrl("Privacy")} className="hover:text-orange-400 transition-colors flex items-center gap-2">
                  <Shield className="w-3 h-3" />
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to={createPageUrl("RefundPolicy")} className="hover:text-orange-400 transition-colors flex items-center gap-2">
                  <FileText className="w-3 h-3" />
                  Refund & Dispute
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Support
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to={createPageUrl("CredionSupport")} className="hover:text-orange-400 transition-colors">
                    Help & Support
                  </Link>
              </li>
              <li>
                <a href="mailto:KingCredion@credabilia.com" className="hover:text-orange-400 transition-colors">
                  KingCredion@credabilia.com
                </a>
              </li>
            </ul>
          </div>

          {/* About */}
          <div>
            <h3 className="font-bold text-white mb-4">About Credabilia</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              A community-driven marketplace for authenticated memorabilia. Every item is vetted by experts. Every transaction is secured by trust.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-700 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <p className="text-sm text-gray-500">
              © {currentYear} Credabilia. All rights reserved.
            </p>
            
            <div className="flex items-center gap-2 bg-gray-800 rounded-full px-3 py-1 border border-gray-700 hover:border-gray-600 transition-colors">
              <Languages className="w-4 h-4 text-gray-400" />
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="h-auto border-0 bg-transparent px-0 py-0 text-xs text-gray-300 shadow-none focus:ring-0 min-w-[96px]">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500">Powered by</p>
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/40608f5e1_officialcrediontransparent.png"
              alt="King Credion"
              className="h-8 w-auto object-contain"
            />
          </div>
        </div>
      </div>
    </footer>
  );
}