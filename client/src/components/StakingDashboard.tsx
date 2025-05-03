import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Download, 
  Upload, 
  CheckCircle,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import { useStaking } from "@/hooks/useStaking";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { YOT_TOKEN_ADDRESS, YOS_TOKEN_ADDRESS } from "@/lib/constants";
import { useMultiWallet } from "@/context/MultiWalletContext";
import { formatNumber } from "@/lib/utils";

interface StakingDashboardProps {
  onTabChange?: (tab: string) => void;
}

export default function StakingDashboard({ onTabChange }: StakingDashboardProps = {}) {
  const { connected } = useMultiWallet();
  const { balance: yotBalance } = useTokenBalance(YOT_TOKEN_ADDRESS);
  const { balance: yosBalance } = useTokenBalance(YOS_TOKEN_ADDRESS);
  
  // Get staking info and global staking stats
  const {
    stakingInfo,
    stakingRates,
    isLoadingStakingInfo,
    isLoadingRates,
    globalStats,
    refetchStakingInfo
  } = useStaking();
  
  // Create a combined loading state
  const isLoading = isLoadingStakingInfo || isLoadingRates;
  
  // Local state
  const [refreshing, setRefreshing] = useState(false);
  
  // Handle manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchStakingInfo();
    setTimeout(() => setRefreshing(false), 1000); // Visual feedback
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-white">Your Staking Dashboard</h2>
        <Button 
          onClick={handleRefresh} 
          variant="outline" 
          size="sm" 
          className="gap-2 border-slate-600 text-white"
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </Button>
      </div>
      
      {/* Program Initialization Warning Banner - now checks if the rates are completely missing */}
      {stakingRates === null && !isLoading && (
        <div className="bg-red-600 text-white p-4 rounded-md mb-6">
          <h3 className="text-lg font-semibold mb-1">Connecting to Staking Program</h3>
          <p>If this message persists, the staking program might need to be initialized by an admin. Try refreshing the page first.</p>
        </div>
      )}
      
      {/* 5-box grid layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Global Total Staked */}
        <Card className="bg-dark-200 border border-slate-700">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Global Total Staked</h3>
            {isLoading ? (
              <div className="animate-pulse bg-dark-300 h-6 w-24 rounded"></div>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-white">{formatNumber(globalStats ? globalStats.totalStaked : 0)}</span>
                <span className="text-sm font-semibold text-blue-400">YOT</span>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Total Users Staked */}
        <Card className="bg-dark-200 border border-slate-700">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Total Users Staked</h3>
            {isLoading ? (
              <div className="animate-pulse bg-dark-300 h-6 w-24 rounded"></div>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-white">{globalStats ? globalStats.totalStakers : 0}</span>
                <span className="text-sm font-semibold text-blue-400">users</span>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Your Staked Amount */}
        <Card className="bg-dark-200 border border-slate-700">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Your Staked Amount</h3>
            {isLoading ? (
              <div className="animate-pulse bg-dark-300 h-6 w-24 rounded"></div>
            ) : (
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-white">{formatNumber(stakingInfo.stakedAmount)}</span>
                  <span className="text-sm font-semibold text-blue-400">YOT</span>
                </div>
                {globalStats && globalStats.totalStaked > 0 && stakingInfo.stakedAmount > 0 && (
                  <div className="text-sm text-blue-400 mt-1 font-medium">
                    ({((stakingInfo.stakedAmount / globalStats.totalStaked) * 100).toFixed(2)}% of global)
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Your Pending Rewards */}
        <Card className="bg-dark-200 border border-slate-700">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Your Pending Rewards</h3>
            {isLoading ? (
              <div className="animate-pulse bg-dark-300 h-6 w-24 rounded"></div>
            ) : (
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-white">{formatNumber(stakingInfo.rewardsEarned, 8)}</span>
                  <span className="text-sm font-semibold text-green-400">YOS</span>
                </div>
                {stakingInfo.rewardsEarned > 0 && (
                  <div className="text-xs text-slate-300 mt-1">
                    <span className="font-medium text-blue-400">Wallet will show:</span> {formatNumber(stakingInfo.rewardsEarned / 1005, 8)} YOS
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Additional row with just the YOS tokens box */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {/* Your YOS Tokens */}
        <Card className="bg-dark-200 border border-slate-700">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Your YOS Tokens</h3>
            {isLoading ? (
              <div className="animate-pulse bg-dark-300 h-6 w-16 rounded"></div>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-white">{formatNumber(yosBalance)}</span>
                <span className="text-sm font-semibold text-green-400">YOS</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Quick Action Buttons */}
      <div className="flex gap-3 mt-4">
        <Button 
          variant="default" 
          className="flex-1 flex justify-center items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 font-medium py-5" 
          disabled={!connected}
          onClick={() => onTabChange && onTabChange("stake")}
        >
          <Download className="h-5 w-5" /> Stake YOT
        </Button>
        <Button 
          variant="default" 
          className="flex-1 flex justify-center items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 font-medium py-5" 
          disabled={!connected || stakingInfo.rewardsEarned <= 0}
          onClick={() => onTabChange && onTabChange("harvest")}
        >
          <CheckCircle className="h-5 w-5" /> Harvest Rewards
        </Button>
      </div>
    </div>
  );
}