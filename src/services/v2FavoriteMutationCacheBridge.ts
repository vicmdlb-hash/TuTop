import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';
import { favoritesVisibleCutoverEnabled } from './v2CostCutoverFlags';
import { visibleFavoritesBackend } from './visibleFavoritesBackend';

if (nationalSchemaEnabled() && favoritesVisibleCutoverEnabled()) {
  const originalToggleFavorite = onlineBackend.toggleFavorite.bind(onlineBackend);

  onlineBackend.toggleFavorite = async (productId: string, shouldFavorite: boolean) => {
    const mutation = visibleFavoritesBackend.beginMutation(productId, shouldFavorite);
    try {
      await originalToggleFavorite(productId, shouldFavorite);
    } catch (error) {
      visibleFavoritesBackend.rollbackMutation(productId, mutation, !shouldFavorite);
      throw error;
    }
  };
}
