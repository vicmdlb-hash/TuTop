import type { Product } from '../types';
import { useAppStore } from '../store/useAppStore';
import { canonicalListingsBackend } from './canonicalListingsBackend';
import { nationalSchemaEnabled } from './nationalBackend';

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

if (nationalSchemaEnabled()) {
  useAppStore.setState({
    updateProduct: (id: string, updates: Partial<Product>) => {
      const before = useAppStore.getState().products.find((product) => product.id === id);
      useAppStore.setState((state) => ({
        products: state.products.map((product) => product.id === id ? { ...product, ...updates } : product),
        syncError: null,
      }));

      void canonicalListingsBackend.updateProduct(id, updates).then(async () => {
        const state = useAppStore.getState();
        const user = state.user;
        const products = await canonicalListingsBackend.loadMarketplaceProducts({
          campusId: user.campus_id || user.university?.campus_id,
          institutionId: user.institution_id || user.university?.institution_id,
          cityId: user.university?.city_id,
          limitPerScope: 30,
        });
        useAppStore.setState({ products, syncError: null });
      }).catch((error) => {
        if (before) {
          useAppStore.setState((state) => ({
            products: state.products.map((product) => product.id === id ? before : product),
            syncError: messageOf(error),
          }));
        } else {
          useAppStore.setState({ syncError: messageOf(error) });
        }
        console.error('[TuTop V2 canonical listing update]', error);
      });
    },
  });
}
