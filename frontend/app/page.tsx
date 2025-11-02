"use client";

import { ParkourGame } from "@/components/ParkourGame";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-green-500 shadow-lg">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-white rounded-2xl p-4 shadow-xl">
                <span className="text-5xl">🏃‍♂️</span>
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
                  Onchain Parkour
                </h1>
                <p className="text-blue-100 text-lg">
                  Encrypted Gaming powered by Zama FHEVM
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Banner */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border-b-2 border-gray-200">
        <div className="container mx-auto px-4 py-4 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="flex items-center justify-center space-x-2">
              <span className="text-2xl">⚡</span>
              <span className="text-gray-700 font-semibold">Press SPACE to Jump</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="text-2xl">🎯</span>
              <span className="text-gray-700 font-semibold">Avoid All Obstacles</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <span className="text-2xl">🔐</span>
              <span className="text-gray-700 font-semibold">Encrypted On-chain Scores</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <ParkourGame />
      </div>
    </main>
  );
}

