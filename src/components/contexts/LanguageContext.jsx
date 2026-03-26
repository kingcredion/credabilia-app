import React, { createContext, useState, useContext, useEffect } from 'react';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import { base44 } from "@/api/base44Client";

const translations = { en, es, fr };

const LanguageContext = createContext();

export function LanguageProvider({ children, initialLanguage = 'en' }) {
  const [language, setLanguage] = useState(() => {
    // Try to get from localStorage first
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('preferred_language');
      if (saved && translations[saved]) return saved;
    }
    return initialLanguage;
  });

  const t = (path) => {
    const keys = path.split('.');
    let current = translations[language];
    for (const key of keys) {
      if (current[key] === undefined) {
        // Fallback to English
        let fallback = translations['en'];
        for (const fbKey of keys) {
          if (fallback[fbKey] === undefined) return path;
          fallback = fallback[fbKey];
        }
        return fallback;
      }
      current = current[key];
    }
    return current;
  };

  const changeLanguage = async (newLang) => {
    if (translations[newLang]) {
      setLanguage(newLang);
      localStorage.setItem('preferred_language', newLang);
      
      // Also update user profile if authenticated
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (isAuth) {
          await base44.auth.updateMe({ preferred_language: newLang });
        }
      } catch (error) {
        console.error("Failed to update language preference", error);
      }
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}