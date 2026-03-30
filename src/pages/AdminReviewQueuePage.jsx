import React from "react";
import AdminReviewQueue from "../components/admin/AdminReviewQueue";
import { ShieldCheck } from "lucide-react";

export default function AdminReviewQueuePage() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
            <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
                <ShieldCheck className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Item Review Queue</h1>
        </div>
        
        <AdminReviewQueue />
      </div>
    </div>
  );
}