import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useFamilies } from './useFamilies';
export function useFamily() {
  const route = useRoute();
  const { families } = useFamilies();
  const familyId = computed(() => Number(route.params.familyId));
  const family = computed(
    () => families.value.find((item) => item.id === familyId.value)!,
  );
  const base = computed(() => `/families/${familyId.value}`);
  return { familyId, family, base };
}
