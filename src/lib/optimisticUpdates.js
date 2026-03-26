/**
 * Optimistic Updates Utilities for React Query
 * 
 * Provides reusable patterns for mutations with optimistic UI updates.
 * Ensures responsive UI by updating immediately and rolling back on error.
 */

import { useQueryClient } from "@tanstack/react-query";

/**
 * Creates optimistic update handlers for a mutation.
 * 
 * Usage:
 *   const { onMutate, onError } = createOptimisticHandlers({
 *     queryKey: ['items'],
 *     updateFn: (data, mutationData) => ({ ...data, ...mutationData })
 *   });
 *   
 *   useMutation({
 *     mutationFn: api.updateItem,
 *     onMutate,
 *     onError,
 *     onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items'] })
 *   });
 */
export function createOptimisticHandlers({ queryKey, updateFn }) {
  const queryClient = useQueryClient();

  return {
    onMutate: async (newData) => {
      // Cancel outgoing queries to prevent overwriting optimistic data
      await queryClient.cancelQueries({ queryKey });

      // Get previous data for rollback
      const previousData = queryClient.getQueryData(queryKey);

      // Optimistically update the cache
      if (previousData) {
        const optimisticData = updateFn(previousData, newData);
        queryClient.setQueryData(queryKey, optimisticData);
      }

      return previousData; // Return as context for onError
    },

    onError: (error, variables, context) => {
      // Rollback to previous data on error
      if (context) {
        queryClient.setQueryData(queryKey, context);
      }
    },
  };
}

/**
 * Optimistic update pattern for list operations (add/remove items).
 * 
 * Usage:
 *   const { onMutate, onError } = createListOptimisticHandlers({
 *     queryKey: ['items'],
 *     mode: 'add', // or 'remove'
 *     getId: (item) => item.id
 *   });
 */
export function createListOptimisticHandlers({ queryKey, mode, getId }) {
  const queryClient = useQueryClient();

  return {
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey) || [];

      if (mode === "add") {
        queryClient.setQueryData(queryKey, [...previousData, newData]);
      } else if (mode === "remove") {
        const itemId = getId(newData);
        queryClient.setQueryData(queryKey, previousData.filter((item) => getId(item) !== itemId));
      }

      return previousData;
    },

    onError: (error, variables, context) => {
      if (context) {
        queryClient.setQueryData(queryKey, context);
      }
    },
  };
}

/**
 * Optimistic update pattern for single item mutations.
 * 
 * Usage:
 *   const { onMutate, onError } = createItemOptimisticHandlers({
 *     queryKey: ['item', itemId],
 *     listQueryKey: ['items'],
 *     getId: (item) => item.id
 *   });
 */
export function createItemOptimisticHandlers({ queryKey, listQueryKey, getId }) {
  const queryClient = useQueryClient();

  return {
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey });
      if (listQueryKey) await queryClient.cancelQueries({ queryKey: listQueryKey });

      const previousItem = queryClient.getQueryData(queryKey);
      const previousList = listQueryKey ? queryClient.getQueryData(listQueryKey) : null;

      // Update single item
      if (previousItem) {
        queryClient.setQueryData(queryKey, { ...previousItem, ...updates });
      }

      // Update in list if available
      if (previousList && listQueryKey) {
        const itemId = previousItem?.id;
        const updatedList = previousList.map((item) =>
          getId(item) === itemId ? { ...item, ...updates } : item
        );
        queryClient.setQueryData(listQueryKey, updatedList);
      }

      return { previousItem, previousList };
    },

    onError: (error, variables, context) => {
      if (context?.previousItem) {
        queryClient.setQueryData(queryKey, context.previousItem);
      }
      if (context?.previousList && listQueryKey) {
        queryClient.setQueryData(listQueryKey, context.previousList);
      }
    },
  };
}

/**
 * Generic optimistic mutation hook wrapper.
 * Simplifies common patterns with built-in error recovery.
 * 
 * Usage:
 *   const mutation = useOptimisticMutation({
 *     mutationFn: api.updateItem,
 *     onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items'] }),
 *     optimistic: {
 *       queryKey: ['items'],
 *       mode: 'update', // 'update' | 'add' | 'remove'
 *       getId: (item) => item.id
 *     }
 *   });
 */
export function useOptimisticMutation(config) {
  const { mutationFn, optimistic, ...rest } = config;
  const queryClient = useQueryClient();

  let handlers = {};

  if (optimistic) {
    const { queryKey, mode, getId } = optimistic;

    if (mode === "update") {
      handlers = createOptimisticHandlers({ queryKey, updateFn: (data, newData) => ({ ...data, ...newData }) });
    } else if (mode === "add") {
      handlers = createListOptimisticHandlers({ queryKey, mode: "add", getId });
    } else if (mode === "remove") {
      handlers = createListOptimisticHandlers({ queryKey, mode: "remove", getId });
    }
  }

  return {
    mutate: (variables, options) => {
      return mutationFn(variables)
        .then((result) => {
          handlers.onMutate?.(variables);
          rest.onSuccess?.(result, variables);
          options?.onSuccess?.(result);
          return result;
        })
        .catch((error) => {
          handlers.onError?.(error, variables);
          rest.onError?.(error, variables);
          options?.onError?.(error);
          throw error;
        });
    },
  };
}

/**
 * Optimistic toggle favorite pattern (add/remove from favorites list).
 * Used by Marketplace and other pages for like/favorite mutations.
 */
export function createOptimisticToggleFavorite({ queryKey, getId = (item) => item.id }) {
  const queryClient = useQueryClient();

  return {
    onMutate: async (itemId, isFavorited) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey) || [];

      if (isFavorited) {
        queryClient.setQueryData(queryKey, previous.filter((item) => getId(item) !== itemId));
      } else {
        queryClient.setQueryData(queryKey, [...previous, { id: itemId }]);
      }

      return previous;
    },

    onError: (error, variables, previous) => {
      if (previous) queryClient.setQueryData(queryKey, previous);
    },
  };
}

// Legacy export for backward compatibility
export const optimisticToggleFavorite = createOptimisticToggleFavorite;