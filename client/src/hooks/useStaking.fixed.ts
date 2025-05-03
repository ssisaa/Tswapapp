import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { useMultiWallet } from '@/context/MultiWalletContext';
import { connection } from '@/lib/completeSwap';
import { toast } from '@/hooks/use-toast';
// Import all staking functions from the blockchain implementation
import { 
  stakeYOTTokens, 
  unstakeYOTTokens, 
  harvestYOSRewards, 
  getStakingInfo,
  updateStakingParameters,
  getStakingProgramState,
  getGlobalStakingStats,
  validateStakingAccounts,
  simulateTransaction
} from '@/lib/solana-staking';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ENDPOINT, YOT_TOKEN_ADDRESS, YOS_TOKEN_ADDRESS, STAKING_PROGRAM_ID } from '@/lib/constants';
import { getAssociatedTokenAddress } from '@solana/spl-token';

// Define utility functions internally since they're not exported by solana-staking.ts
function findStakingAccountAddress(walletAddress: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("staking"), walletAddress.toBuffer()],
    new PublicKey(STAKING_PROGRAM_ID)
  );
}

function findProgramStateAddress(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    new PublicKey(STAKING_PROGRAM_ID)
  );
}

function findProgramAuthorityAddress(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("authority")],
    new PublicKey(STAKING_PROGRAM_ID)
  );
}

// Use getAssociatedTokenAddress from spl-token instead
async function findAssociatedTokenAddress(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey
): Promise<PublicKey> {
  return await getAssociatedTokenAddress(
    tokenMintAddress,
    walletAddress,
    true // allowOwnerOffCurve if needed for PDAs
  );
}

interface StakingInfo {
  stakedAmount: number;
  startTimestamp: number;
  lastHarvestTime: number;
  totalHarvested: number;
  rewardsEarned: number;
}

interface StakingRates {
  stakeRatePerSecond: number;
  harvestThreshold: number;
  dailyAPR: number;
  weeklyAPR: number;
  monthlyAPR: number;
  yearlyAPR: number;
  // APY calculations
  dailyAPY: number;
  weeklyAPY: number;
  monthlyAPY: number;
  yearlyAPY: number;
}

// Add interface for global staking statistics
interface GlobalStakingStats {
  totalStaked: number;
  totalStakers: number;
  totalHarvested: number;
}

export function useStaking() {
  const { publicKey, wallet, connected } = useMultiWallet();
  const queryClient = useQueryClient();
  
  // Add state for global staking statistics
  const [globalStats, setGlobalStats] = useState<GlobalStakingStats>({
    totalStaked: 0,
    totalStakers: 0,
    totalHarvested: 0
  });
  
  // Query to fetch staking info
  const { 
    data: stakingInfo,
    isLoading: isLoadingStakingInfo,
    error: stakingError,
    refetch: refetchStakingInfo
  } = useQuery<StakingInfo>({
    queryKey: ['staking', publicKey?.toString()],
    queryFn: async () => {
      if (!publicKey) {
        return {
          stakedAmount: 0,
          startTimestamp: 0,
          lastHarvestTime: 0,
          totalHarvested: 0,
          rewardsEarned: 0
        };
      }
      return await getStakingInfo(publicKey.toString());
    },
    enabled: !!publicKey && connected,
    refetchInterval: 30000, // Refetch every 30 seconds to update rewards
  });
  
  // Query to fetch program rates
  const {
    data: stakingRates,
    isLoading: isLoadingRates,
    error: ratesError,
    refetch: refetchRates
  } = useQuery<StakingRates | null>({
    queryKey: ['staking', 'rates'],
    queryFn: async () => {
      try {
        return await getStakingProgramState();
      } catch (error) {
        console.error("Failed to get staking program state:", error);
        // The getStakingProgramState function now handles errors internally
        // and returns default values instead of throwing, but we'll keep this as a fallback
        if (error instanceof Error) {
          // Log the error but don't throw it - we'll get default values from getStakingProgramState
          console.warn(`Staking program state error: ${error.message}`);
          // Return values from another attempt - our updated function handles errors
          return await getStakingProgramState();
        }
        return null;
      }
    },
    refetchInterval: 60000, // Refetch every minute
  });
  
  // Mutation for staking tokens
  const stakeMutation = useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      if (!wallet || !connected) {
        throw new Error('Wallet not connected');
      }
      
      if (!publicKey) {
        throw new Error('Wallet public key not available');
      }
      
      try {
        // Call the updated staking function which shows the wallet signature prompt
        // even though the program isn't deployed yet
        const signature = await stakeYOTTokens(wallet, amount);
        console.log("Stake transaction signature:", signature);
        
        // Return both the signature and amount for processing in onSuccess
        return { signature, amount };
      } catch (err) {
        console.error("Error staking:", err);
        throw err;
      }
    },
    onSuccess: (result, variables) => {
      if (!publicKey) return;
      
      // Invalidate queries to trigger refetch later
      queryClient.invalidateQueries({ queryKey: ['staking', publicKey.toString()] });
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
      
      // IMPORTANT: Immediately update the UI with the simulated result
      // Get the current staking info (could be undefined if this is first stake)
      const currentInfo = queryClient.getQueryData<StakingInfo>(['staking', publicKey.toString()]) || {
        stakedAmount: 0,
        startTimestamp: Math.floor(Date.now() / 1000),
        lastHarvestTime: Math.floor(Date.now() / 1000),
        totalHarvested: 0,
        rewardsEarned: 0
      };
      
      // Extract the stake amount from the variables
      const amountToAdd = variables.amount;
      
      // Create a simulated updated staking info
      const updatedInfo = {
        ...currentInfo,
        stakedAmount: (currentInfo.stakedAmount || 0) + amountToAdd,
        // If this is the first stake, set the start timestamp
        startTimestamp: currentInfo.startTimestamp || Math.floor(Date.now() / 1000),
        lastHarvestTime: currentInfo.lastHarvestTime || Math.floor(Date.now() / 1000)
      };
      
      console.log("Updating staking info with simulated data:", updatedInfo);
      
      // Update the cache with simulated data
      queryClient.setQueryData(['staking', publicKey.toString()], updatedInfo);
      
      toast({
        title: "Tokens Staked",
        description: `Successfully staked ${amountToAdd} YOT tokens.`,
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message || "Unknown error occurred";
      
      // Handle specific error messages with user-friendly explanations
      if (errorMessage.includes("Failed to serialize or deserialize account data")) {
        toast({
          title: "Staking Program Not Initialized",
          description: "The staking program needs to be initialized by an admin. Please check admin settings.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("program that does not exist")) {
        toast({
          title: "Staking Program Not Deployed",
          description: "The staking program is not deployed or not accessible. Please check program ID.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("invalid program id")) {
        toast({
          title: "Invalid Program ID",
          description: "The staking program ID is invalid. Check configuration.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("Transaction simulation failed")) {
        toast({
          title: "Transaction Failed",
          description: "The transaction simulation failed. The program may not be properly initialized or has invalid data.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("Insufficient funds")) {
        toast({
          title: "Insufficient Funds",
          description: "You don't have enough SOL to pay for transaction fees.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("Program state account does not exist")) {
        toast({
          title: "Program Not Initialized",
          description: "The staking program state has not been created. An admin needs to initialize it first.",
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Staking Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
      
      console.error("Detailed staking error:", error);
    }
  });
  
  // Mutation for unstaking tokens
  const unstakeMutation = useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      if (!wallet || !connected) {
        throw new Error('Wallet not connected');
      }
      
      if (!publicKey) {
        throw new Error('Wallet public key not available');
      }
      
      try {
        console.log("Starting unstake operation with detailed debugging...");
        console.log("Amount to unstake:", amount);
        
        // Get the wallet public key string for logging
        const walletAddress = publicKey.toString();
        console.log("Wallet address:", walletAddress);
        
        // Find associated token accounts for wallet
        const connection = new Connection(ENDPOINT, 'confirmed');
        
        // Check if the user's YOT token account exists
        const userYotAccount = await findAssociatedTokenAddress(publicKey, new PublicKey(YOT_TOKEN_ADDRESS));
        const userYotAccountInfo = await connection.getAccountInfo(userYotAccount);
        console.log("User YOT account:", userYotAccount.toString(), "exists:", !!userYotAccountInfo);
        
        // Check if the user's YOS token account exists
        const userYosAccount = await findAssociatedTokenAddress(publicKey, new PublicKey(YOS_TOKEN_ADDRESS));
        const userYosAccountInfo = await connection.getAccountInfo(userYosAccount);
        console.log("User YOS account:", userYosAccount.toString(), "exists:", !!userYosAccountInfo);
        
        // Find staking account PDA
        const [userStakingAddress] = findStakingAccountAddress(publicKey);
        const userStakingAccountInfo = await connection.getAccountInfo(userStakingAddress);
        console.log("User staking account:", userStakingAddress.toString(), "exists:", !!userStakingAccountInfo);
        if (userStakingAccountInfo) {
          console.log("User staking account size:", userStakingAccountInfo.data.length, "bytes");
        }
        
        // Check program state account
        const [programStateAddress] = findProgramStateAddress();
        const programStateInfo = await connection.getAccountInfo(programStateAddress);
        console.log("Program state account:", programStateAddress.toString(), "exists:", !!programStateInfo);
        if (programStateInfo) {
          console.log("Program state account size:", programStateInfo.data.length, "bytes");
        }
        
        // Get the program token accounts
        const [programAuthorityAddress] = findProgramAuthorityAddress();
        
        // Check program's YOT token account
        const programYotAccount = await findAssociatedTokenAddress(programAuthorityAddress, new PublicKey(YOT_TOKEN_ADDRESS));
        const programYotAccountInfo = await connection.getAccountInfo(programYotAccount);
        console.log("Program YOT account:", programYotAccount.toString(), "exists:", !!programYotAccountInfo);
        
        // Check program's YOS token account
        const programYosAccount = await findAssociatedTokenAddress(programAuthorityAddress, new PublicKey(YOS_TOKEN_ADDRESS));
        const programYosAccountInfo = await connection.getAccountInfo(programYosAccount);
        console.log("Program YOS account:", programYosAccount.toString(), "exists:", !!programYosAccountInfo);
        
        // Check token balances
        if (programYotAccountInfo) {
          try {
            const programYotBalance = await connection.getTokenAccountBalance(programYotAccount);
            console.log("Program YOT balance:", programYotBalance.value.uiAmount);
          } catch (e) {
            console.error("Error getting program YOT balance:", e);
          }
        }
        
        if (programYosAccountInfo) {
          try {
            const programYosBalance = await connection.getTokenAccountBalance(programYosAccount);
            console.log("Program YOS balance:", programYosBalance.value.uiAmount || 0);
          } catch (e) {
            console.error("Error getting program YOS balance:", e);
          }
        }
        
        // Now call the actual unstake operation with all this debugging information
        console.log("Now executing actual unstake operation...");
        const signature = await unstakeYOTTokens(wallet, amount);
        console.log("Unstake transaction signature:", signature);
        
        // Return both the signature and amount for processing in onSuccess
        return { signature, amount };
      } catch (err) {
        console.error("Error during unstaking operation:", err);
        throw err;
      }
    },
    onSuccess: (result, variables) => {
      if (!publicKey) return;
      
      // Invalidate queries to trigger refetch later
      queryClient.invalidateQueries({ queryKey: ['staking', publicKey.toString()] });
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
      
      // IMPORTANT: Immediately update the UI with the simulated result
      // Get the current staking info
      const currentInfo = queryClient.getQueryData<StakingInfo>(['staking', publicKey.toString()]);
      
      if (currentInfo) {
        // Extract the unstake amount
        const amountToSubtract = variables.amount;
        
        // Create a simulated updated staking info
        const updatedInfo = {
          ...currentInfo,
          stakedAmount: Math.max(0, currentInfo.stakedAmount - amountToSubtract)
        };
        
        console.log("Updating staking info with simulated data:", updatedInfo);
        
        // Update the cache with simulated data
        queryClient.setQueryData(['staking', publicKey.toString()], updatedInfo);
      }
      
      toast({
        title: "Tokens Unstaked",
        description: `Successfully unstaked ${variables.amount} YOT tokens.`,
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message || "Unknown error occurred";
      
      // Handle specific error messages with user-friendly explanations
      if (errorMessage.includes("Failed to serialize or deserialize account data")) {
        toast({
          title: "Staking Program Not Initialized",
          description: "The staking program needs to be initialized by an admin. Please check admin settings.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("program that does not exist")) {
        toast({
          title: "Staking Program Not Deployed",
          description: "The staking program is not deployed or not accessible. Please check program ID.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("invalid program id")) {
        toast({
          title: "Invalid Program ID",
          description: "The staking program ID is invalid. Check configuration.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("Transaction simulation failed")) {
        toast({
          title: "Transaction Failed",
          description: "The transaction simulation failed. The program may not be properly initialized or has invalid data.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("Insufficient funds")) {
        toast({
          title: "Insufficient Funds",
          description: "You don't have enough SOL to pay for transaction fees.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("Program state account does not exist")) {
        toast({
          title: "Program Not Initialized",
          description: "The staking program state has not been created. An admin needs to initialize it first.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("insufficient funds")) {
        toast({
          title: "Insufficient Token Balance",
          description: "You don't have enough YOT tokens staked to unstake that amount.",
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Unstaking Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
      
      console.error("Detailed unstaking error:", error);
    }
  });
  
  // Mutation for harvesting YOS rewards
  const harvestMutation = useMutation({
    mutationFn: async () => {
      if (!wallet || !connected) {
        throw new Error('Wallet not connected');
      }
      
      if (!publicKey) {
        throw new Error('Wallet public key not available');
      }
      
      try {
        console.log("Starting harvest operation with detailed debugging...");
        
        // Get the wallet public key string for logging
        const walletAddress = publicKey.toString();
        console.log("Wallet address:", walletAddress);
        
        // Find associated token accounts for wallet
        const connection = new Connection(ENDPOINT, 'confirmed');
        
        // Check if the user's YOS token account exists
        const userYosAccount = await findAssociatedTokenAddress(publicKey, new PublicKey(YOS_TOKEN_ADDRESS));
        const userYosAccountInfo = await connection.getAccountInfo(userYosAccount);
        console.log("User YOS account:", userYosAccount.toString(), "exists:", !!userYosAccountInfo);
        
        // Find staking account PDA
        const [userStakingAddress] = findStakingAccountAddress(publicKey);
        const userStakingAccountInfo = await connection.getAccountInfo(userStakingAddress);
        console.log("User staking account:", userStakingAddress.toString(), "exists:", !!userStakingAccountInfo);
        if (userStakingAccountInfo) {
          console.log("User staking account size:", userStakingAccountInfo.data.length, "bytes");
        }
        
        // Check program state account
        const [programStateAddress] = findProgramStateAddress();
        const programStateInfo = await connection.getAccountInfo(programStateAddress);
        console.log("Program state account:", programStateAddress.toString(), "exists:", !!programStateInfo);
        if (programStateInfo) {
          console.log("Program state account size:", programStateInfo.data.length, "bytes");
        }
        
        // Get the program token accounts
        const [programAuthorityAddress] = findProgramAuthorityAddress();
        
        // Check program's YOS token account
        const programYosAccount = await findAssociatedTokenAddress(programAuthorityAddress, new PublicKey(YOS_TOKEN_ADDRESS));
        const programYosAccountInfo = await connection.getAccountInfo(programYosAccount);
        console.log("Program YOS account:", programYosAccount.toString(), "exists:", !!programYosAccountInfo);
        
        // Check token balances
        if (programYosAccountInfo) {
          try {
            const programYosBalance = await connection.getTokenAccountBalance(programYosAccount);
            console.log("Program YOS balance:", programYosBalance.value.uiAmount || 0);
          } catch (e) {
            console.error("Error getting program YOS balance:", e);
          }
        }
        
        // Now call the actual harvest operation with all this debugging information
        console.log("Now executing actual harvest operation...");
        // First validate all accounts to ensure we have everything we need
        const validationResult = await validateStakingAccounts(wallet);
        console.log("Validation result:", validationResult);
        
        if (!validationResult.isValid) {
          const errorMessages = validationResult.errors.join(", ");
          throw new Error(`Account validation failed: ${errorMessages}`);
        }
        
        const signature = await harvestYOSRewards(wallet);
        console.log("Harvest transaction signature:", signature);
        
        // Return the signature for processing in onSuccess
        return { signature };
      } catch (err) {
        console.error("Error during harvesting operation:", err);
        throw err;
      }
    },
    onSuccess: (result) => {
      if (!publicKey) return;
      
      // Invalidate queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['staking', publicKey.toString()] });
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
      
      // IMPORTANT: Immediately update the UI with the simulated result
      // Get the current staking info
      const currentInfo = queryClient.getQueryData<StakingInfo>(['staking', publicKey.toString()]);
      
      if (currentInfo) {
        // Create a simulated updated staking info after harvest
        const updatedInfo = {
          ...currentInfo,
          totalHarvested: currentInfo.totalHarvested + currentInfo.rewardsEarned,
          rewardsEarned: 0,
          lastHarvestTime: Math.floor(Date.now() / 1000)
        };
        
        console.log("Updating staking info with simulated data after harvest:", updatedInfo);
        
        // Update the cache with simulated data
        queryClient.setQueryData(['staking', publicKey.toString()], updatedInfo);
      }
      
      toast({
        title: "Rewards Harvested",
        description: "Successfully harvested YOS token rewards.",
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message || "Unknown error occurred";
      
      // Handle specific error messages with user-friendly explanations
      if (errorMessage.includes("Failed to serialize or deserialize account data")) {
        toast({
          title: "Staking Program Not Initialized",
          description: "The staking program needs to be initialized by an admin. Please check admin settings.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("program that does not exist")) {
        toast({
          title: "Staking Program Not Deployed",
          description: "The staking program is not deployed or not accessible. Please check program ID.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("invalid program id")) {
        toast({
          title: "Invalid Program ID",
          description: "The staking program ID is invalid. Check configuration.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("Transaction simulation failed")) {
        toast({
          title: "Transaction Failed",
          description: "The transaction simulation failed. The program may not be properly initialized or has invalid data.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("No rewards to harvest")) {
        toast({
          title: "No Rewards Available",
          description: "You don't have any YOS rewards to harvest yet. Stake longer to earn rewards.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("Insufficient funds")) {
        toast({
          title: "Insufficient Funds",
          description: "You don't have enough SOL to pay for transaction fees.",
          variant: 'destructive',
        });
      } else if (errorMessage.includes("Program state account does not exist")) {
        toast({
          title: "Program Not Initialized",
          description: "The staking program state has not been created. An admin needs to initialize it first.",
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Harvesting Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
      
      console.error("Detailed harvesting error:", error);
    }
  });
  
  // Mutation for admin to update staking parameters
  const updateStakingSettingsMutation = useMutation({
    mutationFn: async ({ 
      ratePerSecond,
      harvestThreshold
    }: { 
      ratePerSecond: number,
      harvestThreshold: number
    }) => {
      if (!wallet || !connected) {
        throw new Error('Wallet not connected');
      }
      
      if (!publicKey) {
        throw new Error('Wallet public key not available');
      }
      
      try {
        console.log("Updating staking parameters...");
        console.log("New rate per second:", ratePerSecond);
        console.log("New harvest threshold:", harvestThreshold);
        
        // Calculate basis points from rate per second
        // Convert percentage to decimal and then to basis points
        // For example, if rate is 0.00000125% per second
        // That's 0.00000125 / 100 = 0.0000000125 as a decimal
        // Multiply by 10^8 to get basis points = 1.25 basis points
        // Since our program expects whole numbers, we'd round to 1 basis point
        
        // For demonstration, if the frontend passes the exact formatted percentage
        // We'll convert it appropriately
        // 1 basis point = 0.01%
        const basisPointsFromPercentage = Math.round(ratePerSecond * 10000);
        console.log("Calculated basis points:", basisPointsFromPercentage);
        
        // For the harvest threshold, we need to convert to blockchain units
        // If the threshold is in YOS tokens, we need to multiply by 10^9 (YOS decimals)
        const harvestThresholdLamports = Math.round(harvestThreshold * Math.pow(10, 9));
        console.log("Harvest threshold in lamports:", harvestThresholdLamports);
        
        // Call the blockchain function to update parameters
        const signature = await updateStakingParameters(
          wallet, 
          basisPointsFromPercentage,  // stake rate in basis points
          harvestThresholdLamports    // minimum amount in YOS lamports
        );
        
        console.log("Update parameters transaction signature:", signature);
        
        // Return signature and new values for processing in onSuccess
        return { 
          signature,
          ratePerSecond,
          harvestThreshold
        };
      } catch (err) {
        console.error("Error updating staking parameters:", err);
        throw err;
      }
    },
    onSuccess: (result) => {
      // Invalidate queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['staking', 'rates'] });
      
      toast({
        title: "Staking Parameters Updated",
        description: `Successfully updated staking rate to ${result.ratePerSecond}% per second and harvest threshold to ${result.harvestThreshold} YOS.`,
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message || "Unknown error occurred";
      
      // Handle specific error messages with user-friendly explanations
      if (errorMessage.includes("not admin")) {
        toast({
          title: "Not Authorized",
          description: "Only the admin wallet can update staking parameters.",
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Update Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
      
      console.error("Detailed parameter update error:", error);
    }
  });
  
  // Load global staking statistics periodically
  useEffect(() => {
    const loadGlobalStats = async () => {
      console.log("Fetching global stats with React Query...");
      try {
        const stats = await getGlobalStakingStats();
        console.log("Updated global stats from query:", stats);
        setGlobalStats(stats);
      } catch (error) {
        console.error("Error fetching global staking stats:", error);
        // Keep last valid stats instead of setting defaults
      }
    };
    
    // Load stats immediately and then periodically
    loadGlobalStats();
    const interval = setInterval(loadGlobalStats, 60000); // Refresh every minute
    
    return () => clearInterval(interval);
  }, []);
  
  return {
    stakingInfo: stakingInfo || {
      stakedAmount: 0,
      startTimestamp: 0,
      lastHarvestTime: 0,
      totalHarvested: 0,
      rewardsEarned: 0
    },
    stakingRates: stakingRates || {
      stakeRatePerSecond: 0,
      harvestThreshold: 0,
      dailyAPR: 0,
      weeklyAPR: 0,
      monthlyAPR: 0,
      yearlyAPR: 0,
      dailyAPY: 0,
      weeklyAPY: 0,
      monthlyAPY: 0,
      yearlyAPY: 0
    },
    globalStats,
    isLoadingStakingInfo,
    isLoadingRates,
    stakingError,
    ratesError,
    stakeMutation,
    unstakeMutation,
    harvestMutation,
    updateStakingSettingsMutation,
    refetchStakingInfo,
    refetchRates
  };
}