/* eslint-disable react/prop-types */
import React from 'react';
import { Trophy, Users, Wallet } from 'lucide-react';

function BudgetProgress({ teamData, maxSquadSize, initialBudget = 110, minBasePrice = 5 }) {
  const squadFilled = teamData.rosterSlotsFilled || (teamData.players ? teamData.players.length : 0);
  const squadPercentage = Math.round((squadFilled / maxSquadSize) * 100);
  const isSquadFull = squadFilled >= maxSquadSize;
  const maxBid = teamData.remainingPoints - (Math.max(0, maxSquadSize - squadFilled - 1) * minBasePrice);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center w-full">
                <p className="text-xs uppercase tracking-wider text-slate-500">Remaining Budget</p>
                <p className="text-xs uppercase tracking-wider text-slate-500">/ {initialBudget}L</p>
              </div>
              <p className="text-xl font-semibold text-slate-900">{teamData.remainingPoints}L</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2 ${isSquadFull ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
              {isSquadFull ? <Trophy className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Max allowed Bid</p>
              <p className="text-xl font-semibold text-slate-900">{maxBid > 0 ? maxBid : 0}</p>
              <p className="text-xs uppercase tracking-wider text-slate-500 mt-1">for current player</p>
            </div>
          </div>
        </div>


        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2 ${isSquadFull ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
              {isSquadFull ? <Trophy className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">{isSquadFull ? 'Squad Full' : 'Squad Size'}</p>
              <p className="text-xl font-semibold text-slate-900">{squadFilled}/{maxSquadSize}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Squad Progress</span>
          <span className="font-semibold text-slate-900">{squadPercentage}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isSquadFull ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-indigo-500 to-cyan-400'}`}
            style={{ width: `${(squadFilled / maxSquadSize) * 100}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>{squadFilled} players selected</span>
          <span>{maxSquadSize - squadFilled} remaining</span>
        </div>
      </div>
    </div>
  );
}

export default BudgetProgress;
