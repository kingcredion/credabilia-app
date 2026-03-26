import React from "react";
import AdminReviewQueue from "../components/admin/AdminReviewQueue";
import { ShieldCheck } from "lucide-react";

export default function AdminReviewQueuePage() {
  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
            <div className="bg-indigo-600 text-white p-2 rounded-lg">
                <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Item Review Queue</h1>
        </div>
        
        <AdminReviewQueue />
      </div>
    </div>
  );
}