import React from "react";
import { CheckCircle2, Circle } from "lucide-react";

export default function ProgressSidebar({ currentStep, steps, completedSteps }) {
  return (
    <div className="hidden md:block w-64 flex-shrink-0">
      <div className="sticky top-24 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Create Listing</h2>
          <p className="text-sm text-gray-500">Complete all steps to list your item</p>
        </div>

        <div className="space-y-4">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const isCompleted = completedSteps[step.id];
            const isCurrent = currentStep === stepNumber;
            
            return (
              <div 
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                  isCurrent ? 'bg-orange-50 border border-orange-200' : ''
                }`}
              >
                <div className="mt-0.5">
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : isCurrent ? (
                    <div className="w-5 h-5 rounded-full border-2 border-orange-500 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                    </div>
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${
                    isCurrent ? 'text-orange-900' : isCompleted ? 'text-gray-900' : 'text-gray-500'
                  }`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}