/**
 * Live Countdown Timer for Quote Expiration
 * Updates every second until expired or quote is no longer pending
 */
import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export default function QuoteCountdownTimer({ expiresAt, status }) {
  const [timeLeft, setTimeLeft] = useState(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (status !== 'pending' || !expiresAt) {
      setTimeLeft(null);
      return;
    }

    const calculateTimeLeft = () => {
      const now = new Date();
      const expires = new Date(expiresAt);
      const diff = expires - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft(null);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`${minutes}m`);
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, status]);

  if (!timeLeft || !status || status !== 'pending') return null;

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      <Clock className="w-3.5 h-3.5" />
      <span>Expires in {timeLeft}</span>
    </div>
  );
}