import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useStaking } from '@/hooks/useStaking';
import { useMultiWallet } from '@/context/MultiWalletContext';
import { formatNumber } from '@/lib/utils';
import { Loader2, Wallet, Info as InfoIcon, Download, Upload, CheckCircle, AlertTriangle, Bell } from 'lucide-react';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { YOT_TOKEN_ADDRESS } from '@/lib/constants';

interface StakingCardProps {
  defaultTab?: 'stake' | 'unstake' | 'harvest';
}

export default function StakingCard({ defaultTab = 'stake' }: StakingCardProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [stakeAmount, setStakeAmount] = useState<string>('');
  const [unstakeAmount, setUnstakeAmount] = useState<string>('');
  const { connected } = useMultiWallet();
  
  // Fetch the user's YOT token balance
  const { balance: yotBalance, isLoading: isLoadingBalance } = useTokenBalance(YOT_TOKEN_ADDRESS);
  
  const {
    stakingInfo,
    stakingRates,
    isLoadingStakingInfo,
    isLoadingRates,
    stakeMutation,
    unstakeMutation,
    harvestMutation
  } = useStaking();
  
  // Aliases for clearer code
  const isLoading = isLoadingStakingInfo || isLoadingRates;
  const isStaking = stakeMutation.isPending;
  const isUnstaking = unstakeMutation.isPending;
  const isHarvesting = harvestMutation.isPending;
  
  // Function aliases for better readability
  const stakeTokens = (params: { amount: number }) => stakeMutation.mutate(params);
  const unstakeTokens = (params: { amount: number }) => unstakeMutation.mutate(params);
  const harvestRewards = () => harvestMutation.mutate();
  
  // Update activeTab when defaultTab prop changes
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);
  
  // Format the timestamp to a readable date
  const formatDate = (timestamp: number): string => {
    if (timestamp === 0) return 'Not staked yet';
    return new Date(timestamp * 1000).toLocaleDateString();
  };
  
  // Calculate time since last harvest
  const getTimeSinceLastHarvest = (): string => {
    if (stakingInfo.lastHarvestTime === 0) return 'Never harvested';
    
    const now = Math.floor(Date.now() / 1000);
    const seconds = now - stakingInfo.lastHarvestTime;
    
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
  };

  // Handle stake button click
  const handleStake = () => {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) return;
    stakeTokens({ amount: parseFloat(stakeAmount) });
    setStakeAmount('');
  };

  // Handle unstake button click
  const handleUnstake = () => {
    if (!unstakeAmount || parseFloat(unstakeAmount) <= 0) return;
    
    // Ensure user can't unstake more than they have staked
    const amount = Math.min(parseFloat(unstakeAmount), stakingInfo.stakedAmount);
    unstakeTokens({ amount });
    setUnstakeAmount('');
  };

  // Handle max stake/unstake buttons
  const handleMaxStake = () => {
    // Use the actual YOT balance from wallet
    setStakeAmount(yotBalance.toString());
  };

  const handleMaxUnstake = () => {
    setUnstakeAmount(stakingInfo.stakedAmount.toString());
  };

  // Handle harvest button click
  const handleHarvest = () => {
    harvestRewards();
  };

  // Check if rewards can be harvested
  // CRITICAL FIX: Use raw rewards directly for comparison with threshold
  // The raw rewards (630 YOS) should be compared with threshold (1 YOS) directly
  const rawRewards = stakingInfo.rewardsEarned;
  const normalizedRewards = rawRewards / 9260; // Only for display purposes
  const harvestThreshold = stakingRates?.harvestThreshold || 1;
  const progress = (rawRewards / harvestThreshold) * 100; // Use RAW rewards for progress calculation
  
  // Allow harvest when raw rewards exceed threshold (not normalized rewards)
  const canHarvest = rawRewards > 0 && rawRewards >= harvestThreshold;
  
  // Debug the values to see why the button is disabled
  console.log("HARVEST DEBUG:", {
    rewardsEarnedRaw: stakingInfo.rewardsEarned,
    normalizedRewards,
    harvestThreshold,
    progress: progress.toFixed(2) + '%',
    canHarvest,
    buttonDisabled: !canHarvest || isHarvesting || !connected,
    isHarvesting,
    connected
  });

  return (
    <Card className="w-full bg-dark-200">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-white">YOT Staking</CardTitle>
        <CardDescription className="text-gray-300">
          Stake YOT tokens to earn YOS rewards. All actions require wallet signature.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="space-y-6">
              {/* Staking Stats */}
              <div className="grid gap-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Staked:</span>
                  <span className="font-medium text-white">{stakingInfo.stakedAmount.toLocaleString('en-US')} YOT</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-400">Pending Rewards:</span>
                  <div className="text-right">
                    <span className="font-medium text-white">{formatNumber(normalizedRewards, 2)} YOS</span>
                  </div>
                </div>
                <Alert className="mt-2 bg-blue-950/30 border-blue-700">
                  <InfoIcon className="h-4 w-4 text-blue-500" />
                  <AlertTitle className="text-blue-400 text-xs font-medium">Updated Reward Calculation</AlertTitle>
                  <AlertDescription className="text-blue-200 text-xs">
                    <strong>Rewards Update:</strong> We've improved reward calculation to use simple linear interest 
                    (principal × rate × time) which matches the Solana program exactly. The displayed amount shows what 
                    you'll actually receive, while the wallet may display a larger number due to internal scaling.
                  </AlertDescription>
                </Alert>
                
                <div className="flex justify-between">
                  <span className="text-gray-400">Staking Since:</span>
                  <span className="font-medium text-white">{formatDate(stakingInfo.startTimestamp)}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Harvest:</span>
                  <span className="font-medium text-white">{getTimeSinceLastHarvest()} ago</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Harvested:</span>
                  <div className="text-right">
                    <span className="font-medium text-white">{formatNumber(stakingInfo.totalHarvested / 9260, 2)} YOS</span>
                  </div>
                </div>
              </div>
              
              <div className="h-px bg-border" />
              
              {/* Staking APR/APY Information */}
              <div className="bg-dark-300 rounded-lg p-4 space-y-3 border border-slate-700">
                <h3 className="text-base font-semibold text-white">Staking APR/APY Rates</h3>
                
                <div className="border-t border-slate-700 py-3">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium text-white">Per Second Rate:</div>
                    <div className="text-sm font-bold text-green-400">
                      {`${(stakingRates?.stakeRatePerSecond || 0).toFixed(8)}%`}
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 border-b border-slate-700">
                    <div className="text-xs font-medium text-gray-400">Daily APR:</div>
                    <div className="text-sm font-bold text-green-400">
                      {`${(stakingRates?.dailyAPR || 0).toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="p-2 border-b border-slate-700">
                    <div className="text-xs font-medium text-gray-400">Daily APY:</div>
                    <div className="text-sm font-bold text-green-400">
                      {`${(stakingRates?.dailyAPY || 0).toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="p-2 border-b border-slate-700">
                    <div className="text-xs font-medium text-gray-400">Weekly APR:</div>
                    <div className="text-sm font-bold text-green-400">
                      {`${(stakingRates?.weeklyAPR || 0).toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="p-2 border-b border-slate-700">
                    <div className="text-xs font-medium text-gray-400">Weekly APY:</div>
                    <div className="text-sm font-bold text-green-400">
                      {`${(stakingRates?.weeklyAPY || 0).toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="p-2 border-b border-slate-700">
                    <div className="text-xs font-medium text-gray-400">Monthly APR:</div>
                    <div className="text-sm font-bold text-green-400">
                      {`${(stakingRates?.monthlyAPR || 0).toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="p-2 border-b border-slate-700">
                    <div className="text-xs font-medium text-gray-400">Monthly APY:</div>
                    <div className="text-sm font-bold text-green-400">
                      {`${(stakingRates?.monthlyAPY || 0).toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-medium text-gray-400">Yearly APR:</div>
                    <div className="text-sm font-bold text-green-400">
                      {`${(stakingRates?.yearlyAPR || 0).toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-medium text-gray-400">Yearly APY:</div>
                    <div className="text-sm font-bold text-green-400">
                      {`${(stakingRates?.yearlyAPY || 0).toFixed(2)}%`}
                    </div>
                  </div>
                </div>
                
                <div className="text-xs text-gray-400 flex items-center mt-2">
                  <InfoIcon className="h-3 w-3 mr-1 text-blue-400" />
                  Rates are set by the admin and may change
                </div>
              </div>
              
              <div className="h-px bg-border" />
              
              {/* Staking Actions with Tabs */}
              <Tabs defaultValue={activeTab} value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid grid-cols-3 mb-4">
                  <TabsTrigger value="stake" disabled={!connected}>
                    <Download className="h-4 w-4 mr-2" />
                    Stake
                  </TabsTrigger>
                  <TabsTrigger value="unstake" disabled={!connected || stakingInfo.stakedAmount <= 0}>
                    <Upload className="h-4 w-4 mr-2" />
                    Unstake
                  </TabsTrigger>
                  <TabsTrigger value="harvest" disabled={!connected || stakingInfo.rewardsEarned <= 0}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Harvest
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="stake" className="mt-0 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">Stake YOT</h3>
                    <div className="flex items-center text-sm">
                      <Wallet className="h-4 w-4 mr-1 text-gray-400" />
                      <span className="text-gray-400">Available: </span>
                      <span className="font-medium ml-1 text-white">{yotBalance.toLocaleString('en-US')} YOT</span>
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <div className="bg-dark-100 rounded-md border border-slate-700 flex justify-between items-center">
                      <Input
                        type="number"
                        placeholder="Amount to stake"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        className="border-0 bg-transparent h-14 px-4 focus-visible:ring-0 focus-visible:ring-offset-0"
                        disabled={isStaking || !connected}
                      />
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="mr-2 bg-slate-700 text-white hover:bg-slate-600"
                        onClick={handleMaxStake}
                        disabled={isStaking || !connected}
                      >
                        MAX
                      </Button>
                    </div>
                    <Button 
                      onClick={handleStake} 
                      disabled={!stakeAmount || isStaking || !connected}
                      className="h-14 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                    >
                      {isStaking ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : 'Stake'}
                    </Button>
                  </div>
                  <div className="bg-dark-300 border border-border p-3 rounded-lg text-sm mt-4">
                    <div className="flex items-start">
                      <InfoIcon className="h-4 w-4 mr-2 mt-0.5 text-primary" />
                      <p className="text-gray-300">
                        Staking locks your YOT tokens in the smart contract and automatically begins generating YOS rewards at {(stakingRates?.dailyAPY || 0).toFixed(2)}% daily APY (compound interest).
                      </p>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="unstake" className="mt-0 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">Unstake YOT</h3>
                    <div className="flex items-center text-sm">
                      <span className="text-gray-400">Staked: </span>
                      <span className="font-medium ml-1 text-white">{stakingInfo.stakedAmount.toLocaleString('en-US')} YOT</span>
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <div className="bg-dark-100 rounded-md border border-slate-700 flex justify-between items-center">
                      <Input
                        type="number"
                        placeholder="Amount to unstake"
                        value={unstakeAmount}
                        onChange={(e) => setUnstakeAmount(e.target.value)}
                        className="border-0 bg-transparent h-14 px-4 focus-visible:ring-0 focus-visible:ring-offset-0"
                        disabled={isUnstaking || !connected}
                      />
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="mr-2 bg-slate-700 text-white hover:bg-slate-600"
                        onClick={handleMaxUnstake}
                        disabled={isUnstaking || !connected}
                      >
                        MAX
                      </Button>
                    </div>
                    <Button 
                      onClick={handleUnstake} 
                      disabled={!unstakeAmount || isUnstaking || !connected}
                      className="h-14 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                    >
                      {isUnstaking ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : 'Unstake'}
                    </Button>
                  </div>

                  
                  {stakingInfo.rewardsEarned > 0 && (
                    <Alert className="mt-4 bg-blue-950/30 border-blue-700">
                      <Bell className="h-4 w-4 text-blue-500" />
                      <AlertTitle className="text-blue-400 text-xs font-medium">Pending Rewards</AlertTitle>
                      <AlertDescription className="text-blue-200 text-xs">
                        You have <strong>{formatNumber(normalizedRewards, 2)} YOS</strong> in unclaimed rewards.
                        Consider harvesting your rewards before unstaking to avoid losing them.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="bg-dark-300 border border-border p-3 rounded-lg text-sm mt-4">
                    <div className="flex items-start">
                      <InfoIcon className="h-4 w-4 mr-2 mt-0.5 text-primary" />
                      <p className="text-gray-300">
                        Unstaking will return your YOT tokens to your wallet. There is no lock-up period or penalties for unstaking.
                      </p>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="harvest" className="mt-0 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">Harvest Rewards</h3>
                    <span className="text-sm text-gray-400">
                      <span className="font-medium text-white">{formatNumber(normalizedRewards, 2)}</span> YOS available
                    </span>
                  </div>
                  
                  {/* Progress bar for harvest threshold */}
                  <div className="space-y-2 mt-2">
                    <div className="w-full bg-slate-700 rounded-full h-2.5">
                      <div 
                        className={`h-2.5 rounded-full ${rawRewards >= harvestThreshold ? 'bg-green-500' : 'bg-blue-600'}`}
                        style={{ 
                          width: `${Math.min(100, progress)}%` 
                        }}
                      ></div>
                    </div>
                    <div className="flex justify-end items-center text-xs">
                      <span className={`font-medium ${rawRewards >= harvestThreshold ? 'text-green-400' : 'text-amber-400'}`}>
                        Minimum harvest amount: {harvestThreshold.toLocaleString('en-US')} YOS
                      </span>
                    </div>
                  </div>
                  
                  {/* Debug information hidden */}
                  
                  <div className="flex flex-col space-y-2 mt-3">
                    <Button 
                      onClick={handleHarvest} 
                      disabled={!canHarvest || isHarvesting || !connected}
                      className="h-14 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                    >
                      {isHarvesting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle className="h-5 w-5 mr-2" />}
                      Harvest Rewards
                    </Button>
                  </div>

                  
                  <div className="bg-dark-300 border border-border p-3 rounded-lg text-sm mt-4">
                    <div className="flex items-start">
                      <InfoIcon className="h-4 w-4 mr-2 mt-0.5 text-primary" />
                      <p className="text-gray-300">
                        Harvesting will claim your earned YOS rewards and send them to your wallet. You can harvest anytime rewards are available.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              
              {!connected && (
                <div className="bg-dark-300 border border-border p-4 rounded-lg text-center">
                  <p className="text-sm text-gray-300">
                    Connect your wallet to use staking features
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}