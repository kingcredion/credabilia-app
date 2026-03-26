import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useFollowMutation(user, displayUser, isFollowing, isKingCredionProfile) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user || !displayUser) throw new Error("Missing user data");

      if (isFollowing) {
        const follows = await base44.entities.Follow.filter({
          follower_email: user.email,
          following_email: displayUser.email
        });
        if (follows[0]) {
          await base44.entities.Follow.delete(follows[0].id);
        }
        
        if (!isKingCredionProfile) {
          await base44.entities.User.update(displayUser.id, {
            followers_count: Math.max(0, (displayUser.followers_count || 0) - 1)
          });
        }
        await base44.auth.updateMe({
          following_count: Math.max(0, (user.following_count || 0) - 1)
        });
      } else {
        await base44.entities.Follow.create({
          follower_email: user.email,
          follower_name: user.full_name || user.email,
          following_email: displayUser.email,
          following_name: displayUser.full_name || displayUser.email
        });
        
        if (!isKingCredionProfile) {
          await base44.entities.User.update(displayUser.id, {
            followers_count: (displayUser.followers_count || 0) + 1
          });
        }
        await base44.auth.updateMe({
          following_count: (user.following_count || 0) + 1
        });

        await base44.entities.ActivityEvent.create({
          user_email: user.email,
          user_name: user.full_name || user.email.split('@')[0],
          user_avatar: user.avatar_url,
          event_type: "new_follow",
          description: `started following ${displayUser.full_name || displayUser.email.split('@')[0]}`,
          related_user_email: displayUser.email
        });
      }
    },
    onMutate: async () => {
      // Cancel in-flight queries for immediate optimistic update
      await queryClient.cancelQueries({
        queryKey: ['is-following', user?.email, displayUser?.email]
      });

      // Save previous state
      const previousFollowing = queryClient.getQueryData([
        'is-following',
        user?.email,
        displayUser?.email
      ]);

      // Optimistically update UI immediately
      queryClient.setQueryData(
        ['is-following', user?.email, displayUser?.email],
        !isFollowing
      );

      return { previousFollowing };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousFollowing !== undefined) {
        queryClient.setQueryData(
          ['is-following', user?.email, displayUser?.email],
          context.previousFollowing
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['is-following', user?.email, displayUser?.email]
      });
      queryClient.invalidateQueries({
        queryKey: ['followers', displayUser?.email, isKingCredionProfile]
      });
      queryClient.invalidateQueries({
        queryKey: ['following', displayUser?.email, isKingCredionProfile]
      });
    },
  });
}