"use client";

import React, { useState, useEffect } from "react";
import { WARDS, HOSPITALS } from "../../lib/data/wards";
import { loadWards, loadHospitals } from "../../lib/data/wards-remote";
import { useApp } from "../../lib/context/AppContext";
import { Check, Save, Edit2 } from "lucide-react";

export default function ProfilePage() {
  const { user, saveProfile, language } = useApp();

  const [name, setName] = useState(user.name);
  const [mobile, setMobile] = useState(user.mobile);
  const [ward, setWard] = useState(user.ward);
  const [income, setIncome] = useState(user.income);
  const [domicileYears, setDomicileYears] = useState(user.domicileYears);
  const [category, setCategory] = useState(user.category);
  const [rationCard, setRationCard] = useState(user.rationCard);
  const [hasProduceVendor, setHasProduceVendor] = useState(user.hasProduceVendor);
  const [dbtEnabled, setDbtEnabled] = useState(user.dbtEnabled);
  const [disabilityStatus, setDisabilityStatus] = useState(user.disabilityStatus);
  const [empaneledHospitals, setEmpaneledHospitals] = useState<string[]>(user.empaneledHospitals);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [wards, setWards] = useState<string[]>(WARDS);
  const [availableHospitals, setAvailableHospitals] = useState(HOSPITALS);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadWards().then(setWards);
    void loadHospitals().then(setAvailableHospitals);
  }, []);

  // Resync the form whenever the stored profile (re)loads.
  useEffect(() => {
    setName(user.name);
    setMobile(user.mobile);
    setWard(user.ward);
    setIncome(user.income);
    setDomicileYears(user.domicileYears);
    setCategory(user.category);
    setRationCard(user.rationCard);
    setHasProduceVendor(user.hasProduceVendor);
    setDbtEnabled(user.dbtEnabled);
    setDisabilityStatus(user.disabilityStatus);
    setEmpaneledHospitals(user.empaneledHospitals);
  }, [user]);

  const toggleHospital = (hospName: string) => {
    setEmpaneledHospitals((prev) =>
      prev.includes(hospName) ? prev.filter((h) => h !== hospName) : [...prev, hospName]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    const { error } = await saveProfile({
      name,
      mobile,
      ward,
      income,
      domicileYears,
      category,
      rationCard,
      hasProduceVendor,
      dbtEnabled,
      disabilityStatus,
      empaneledHospitals
    });
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setSavedSuccess(true);
    setIsEditing(false);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 4000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="border-b border-[#333] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {language === "mr" ? "नागरिक नोंदणी व पात्रता तपशील" : "Citizen Profile & Eligibility Criteria"}
          </h1>
          <p className="text-xs sm:text-sm text-gray-400">
            {language === "mr"
              ? "आपल्या कुटुंबाची माहिती येथे सेव्ह करा. असिस्टंट आपोआप लागू होणाऱ्या योजना निश्चित करतो."
              : "Save your household details once. The assistant uses these parameters to verify income ceilings and hospital coverage."}
          </p>
        </div>
        
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-white text-xs font-semibold rounded transition-colors flex items-center space-x-1.5 whitespace-nowrap"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>{language === "mr" ? "प्रोफाइल संपादित करा" : "Edit Profile"}</span>
          </button>
        )}
      </div>

      {saveError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-xs font-semibold">
          Could not save profile: {saveError}
        </div>
      )}

      {savedSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-lg text-xs font-semibold flex items-center space-x-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-emerald-500" />
          <span>Profile saved successfully! Your eligibility parameters and hospital checklist have been updated.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. Household Details */}
        <div className="bg-[#050505] border border-[#333] rounded-lg p-5 shadow-subtle space-y-4">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-[#222] pb-2">
            1. Household & Jurisdiction Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-gray-300 font-medium mb-1">Full Name (as on Identity)</label>
              <input
                type="text"
                required
                disabled={!isEditing}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full text-xs px-3 py-2 border rounded outline-none text-white transition-colors ${
                  isEditing ? "border-[#444] focus:border-emerald-500 bg-transparent" : "border-transparent bg-[#111] opacity-70"
                }`}
              />
            </div>

            <div>
              <label className="block text-gray-300 font-medium mb-1">Mobile Number</label>
              <input
                type="tel"
                required
                disabled={!isEditing}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className={`w-full text-xs px-3 py-2 border rounded outline-none text-white transition-colors ${
                  isEditing ? "border-[#444] focus:border-emerald-500 bg-transparent" : "border-transparent bg-[#111] opacity-70"
                }`}
              />
            </div>

            <div>
              <label className="block text-gray-300 font-medium mb-1">Administrative Ward</label>
              <select
                value={ward}
                disabled={!isEditing}
                onChange={(e) => setWard(e.target.value)}
                className={`w-full text-xs px-3 py-2 border rounded outline-none text-white transition-colors appearance-none ${
                  isEditing ? "border-[#444] focus:border-emerald-500 bg-[#050505]" : "border-transparent bg-[#111] opacity-70"
                }`}
              >
                {!wards.includes(ward) && ward && <option value={ward}>{ward}</option>}
                {wards.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-300 font-medium mb-1">Annual Household Income (Rs.)</label>
              <input
                type="number"
                required
                disabled={!isEditing}
                value={income}
                onChange={(e) => setIncome(Number(e.target.value))}
                className={`w-full text-xs px-3 py-2 border rounded outline-none text-white tabular-nums transition-colors ${
                  isEditing ? "border-[#444] focus:border-emerald-500 bg-transparent" : "border-transparent bg-[#111] opacity-70"
                }`}
              />
              <span className="text-[11px] text-gray-600 mt-0.5 block">As per Tahsildar Certificate</span>
            </div>

            <div>
              <label className="block text-gray-300 font-medium mb-1">Continuous Pune Domicile</label>
              <select
                value={domicileYears}
                disabled={!isEditing}
                onChange={(e) => setDomicileYears(Number(e.target.value))}
                className={`w-full text-xs px-3 py-2 border rounded outline-none text-white transition-colors appearance-none ${
                  isEditing ? "border-[#444] focus:border-emerald-500 bg-[#050505]" : "border-transparent bg-[#111] opacity-70"
                }`}
              >
                <option value={1}>1 Year</option>
                <option value={2}>2 Years</option>
                <option value={3}>3 Years (Meets statutory norm)</option>
                <option value={5}>5+ Years</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-300 font-medium mb-1">Social Category</label>
              <select
                value={category}
                disabled={!isEditing}
                onChange={(e) => setCategory(e.target.value)}
                className={`w-full text-xs px-3 py-2 border rounded outline-none text-white transition-colors appearance-none ${
                  isEditing ? "border-[#444] focus:border-emerald-500 bg-[#050505]" : "border-transparent bg-[#111] opacity-70"
                }`}
              >
                <option value="Open / General">Open / General</option>
                <option value="OBC">OBC (Other Backward Class)</option>
                <option value="SC">SC (Scheduled Caste)</option>
                <option value="ST">ST (Scheduled Tribe)</option>
                <option value="VJNT">VJNT (Nomadic Tribes)</option>
                <option value="EWS">EWS (Economically Weaker Section)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2. Welfare & Livelihood Status */}
        <div className="bg-[#050505] border border-[#333] rounded-lg p-5 shadow-subtle space-y-4">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider border-b border-[#222] pb-2">
            2. Welfare & Livelihood Status
          </h2>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-gray-300 font-medium mb-1.5">Ration Card Category:</label>
              <div className="flex flex-wrap gap-4 text-gray-200">
                <label className={`flex items-center space-x-1.5 ${isEditing ? "cursor-pointer" : (rationCard === "Yellow (BPL)" ? "pointer-events-none" : "opacity-30 pointer-events-none")}`}>
                  <input
                    type="radio"
                    name="rationCard"
                    value="Yellow (BPL)"
                    checked={rationCard === "Yellow (BPL)"}
                    onChange={(e) => isEditing && setRationCard(e.target.value)}
                    className="w-4 h-4 accent-yellow-500"
                  />
                  <span>Yellow (BPL)</span>
                </label>
                <label className={`flex items-center space-x-1.5 ${isEditing ? "cursor-pointer" : (rationCard === "Orange (APL Low-Income)" ? "pointer-events-none" : "opacity-30 pointer-events-none")}`}>
                  <input
                    type="radio"
                    name="rationCard"
                    value="Orange (APL Low-Income)"
                    checked={rationCard === "Orange (APL Low-Income)"}
                    onChange={(e) => isEditing && setRationCard(e.target.value)}
                    className="w-4 h-4 accent-orange-500"
                  />
                  <span>Orange (APL Low-Income)</span>
                </label>
                <label className={`flex items-center space-x-1.5 ${isEditing ? "cursor-pointer" : (rationCard === "White (Above 1 Lakh)" ? "pointer-events-none" : "opacity-30 pointer-events-none")}`}>
                  <input
                    type="radio"
                    name="rationCard"
                    value="White (Above 1 Lakh)"
                    checked={rationCard === "White (Above 1 Lakh)"}
                    onChange={(e) => isEditing && setRationCard(e.target.value)}
                    className="w-4 h-4 accent-white"
                  />
                  <span>White (Above 1 Lakh)</span>
                </label>
                <label className={`flex items-center space-x-1.5 ${isEditing ? "cursor-pointer" : (rationCard === "None" ? "pointer-events-none" : "opacity-30 pointer-events-none")}`}>
                  <input
                    type="radio"
                    name="rationCard"
                    value="None"
                    checked={rationCard === "None"}
                    onChange={(e) => isEditing && setRationCard(e.target.value)}
                    className="w-4 h-4 accent-gray-500"
                  />
                  <span>None</span>
                </label>
              </div>
            </div>

            <div className="pt-2 border-t border-[#222] grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="block text-gray-300 font-medium">Bank Account Linked to Aadhaar (DBT)?</span>
                <div className="flex flex-wrap gap-4 text-gray-200">
                  <label className={`flex items-center space-x-1.5 ${isEditing ? "cursor-pointer" : (dbtEnabled === true ? "pointer-events-none" : "opacity-30 pointer-events-none")}`}>
                    <input
                      type="radio"
                      name="dbtEnabled"
                      value="true"
                      checked={dbtEnabled === true}
                      onChange={() => isEditing && setDbtEnabled(true)}
                      className="w-4 h-4 accent-emerald-500"
                    />
                    <span>Yes (NPCI Mapped)</span>
                  </label>
                  <label className={`flex items-center space-x-1.5 ${isEditing ? "cursor-pointer" : (dbtEnabled === false ? "pointer-events-none" : "opacity-30 pointer-events-none")}`}>
                    <input
                      type="radio"
                      name="dbtEnabled"
                      value="false"
                      checked={dbtEnabled === false}
                      onChange={() => isEditing && setDbtEnabled(false)}
                      className="w-4 h-4 accent-red-500"
                    />
                    <span>No / Don&apos;t Know</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Disability Status (Divyangjan)</label>
                <select
                  value={disabilityStatus}
                  disabled={!isEditing}
                  onChange={(e) => setDisabilityStatus(e.target.value)}
                  className={`w-full text-xs px-3 py-2 border rounded outline-none text-white transition-colors appearance-none ${
                    isEditing ? "border-[#444] focus:border-emerald-500 bg-[#050505]" : "border-transparent bg-[#111] opacity-70"
                  }`}
                >
                  <option value="None">None</option>
                  <option value="Visual Impairment (40%+) ">Visual Impairment (40%+)</option>
                  <option value="Locomotor Disability (40%+)">Locomotor Disability (40%+)</option>
                  <option value="Hearing Impairment (40%+)">Hearing Impairment (40%+)</option>
                  <option value="Other Disability (UDID Holder)">Other Disability (UDID Holder)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-[#222] space-y-2">
              <span className="block text-gray-300 font-medium">Livelihood:</span>
              <label className={`flex items-center space-x-2 text-gray-200 ${isEditing ? "cursor-pointer" : "pointer-events-none"}`}>
                <input
                  type="checkbox"
                  checked={hasProduceVendor}
                  onChange={(e) => isEditing && setHasProduceVendor(e.target.checked)}
                  className="rounded w-4 h-4 accent-emerald-500 bg-[#1a1a1a]"
                />
                <span>Street vendor or weekly-market hawker (PM SVANidhi)</span>
              </label>
            </div>
          </div>
        </div>

        {/* 3. Nearest Empaneled Hospitals */}
        <div className="bg-[#050505] border border-[#333] rounded-lg p-5 shadow-subtle space-y-3">
          <div className="border-b border-[#222] pb-2">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              3. Nearest Empaneled Hospitals (Shahari Garib Arogya Scheme)
            </h2>
            <p className="text-[11px] text-gray-500">
              Select the hospitals your family visits. The assistant verifies treatment empanelment for these facilities.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
            {availableHospitals.map((hosp) => {
              const isSelected = empaneledHospitals.includes(hosp.name);
              return (
                <div
                  key={hosp.name}
                  onClick={() => {
                    if (isEditing) toggleHospital(hosp.name);
                  }}
                  className={`p-3 rounded border transition-colors flex items-start space-x-2.5 ${
                    isEditing ? "cursor-pointer" : "opacity-80"
                  } ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-[#333] bg-[#050505] hover:border-[#444]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // handled by parent div
                    className={`mt-0.5 rounded text-emerald-500 focus:ring-emerald-500 bg-transparent ${isEditing ? "border-[#444]" : "border-[#333]"}`}
                  />
                  <div className="flex-1">
                    <span className="font-semibold text-white block">{hosp.name}</span>
                    <span className="text-[11px] text-gray-500 block">{hosp.area}</span>
                    <span className="text-[11px] font-medium text-emerald-500">{hosp.type}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Save CTA */}
        {isEditing && (
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-6 py-2.5 bg-transparent border border-[#444] hover:bg-[#111] text-white text-xs font-semibold rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded shadow-subtle transition-colors flex items-center space-x-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Save Profile & Eligibility</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
