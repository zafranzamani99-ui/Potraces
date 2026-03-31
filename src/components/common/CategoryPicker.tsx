import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { CategoryOption } from '../../types';
import { lightTap } from '../../services/haptics';

interface CategoryPickerProps {
  categories: CategoryOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  label?: string;
  layout?: 'horizontal' | 'grid' | 'dropdown';
  onNavigateToSettings?: () => void;
}

const CategoryPicker: React.FC<CategoryPickerProps> = ({
  categories,
  selectedId,
  onSelect,
  label,
  layout = 'horizontal',
  onNavigateToSettings,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownAnimation, setDropdownAnimation] = useState<'fade' | 'none'>('fade');
  const selectedCategory = useMemo(() => categories.find((c) => c.id === selectedId), [categories, selectedId]);

  const settingsHint = (
    <TouchableOpacity
      style={styles.settingsHint}
      onPress={() => onNavigateToSettings ? onNavigateToSettings() : navigation.navigate('Settings', { scrollTo: 'categories' })}
      activeOpacity={0.6}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.settingsHintText}>Can't find yours?</Text>
      <Text style={styles.settingsHintLink}>Manage in Settings</Text>
      <Feather name="arrow-right" size={12} color={C.accent} />
    </TouchableOpacity>
  );

  const renderDropdownItem = useCallback(({ item }: { item: CategoryOption }) => {
    const isSelected = item.id === selectedId;
    return (
      <TouchableOpacity
        style={[
          styles.dropdownItem,
          isSelected && {
            backgroundColor: withAlpha(item.color, 0.1),
          },
        ]}
        onPress={() => {
          lightTap();
          onSelect(item.id);
          setDropdownOpen(false);
        }}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.dropdownItemIcon,
            {
              backgroundColor: isSelected
                ? item.color
                : withAlpha(item.color, 0.15),
            },
          ]}
        >
          <Feather
            name={item.icon as keyof typeof Feather.glyphMap}
            size={18}
            color={isSelected ? '#fff' : item.color}
          />
        </View>
        <Text
          style={[
            styles.dropdownItemText,
            isSelected && {
              color: item.color,
              fontWeight: TYPOGRAPHY.weight.bold,
            },
          ]}
        >
          {item.name}
        </Text>
        {isSelected && (
          <Feather name="check" size={18} color={item.color} />
        )}
      </TouchableOpacity>
    );
  }, [selectedId, onSelect]);

  const renderCategoryButton = (category: CategoryOption) => (
    <TouchableOpacity
      key={category.id}
      style={[
        styles.categoryButton,
        selectedId === category.id && styles.selectedCategory,
        {
          borderColor: category.color,
          backgroundColor:
            selectedId === category.id ? category.color : C.background,
        },
        layout === 'grid' && styles.gridItem,
      ]}
      onPress={() => { lightTap(); onSelect(category.id); }}
      activeOpacity={0.7}
    >
      <Feather
        name={category.icon as keyof typeof Feather.glyphMap}
        size={20}
        color={selectedId === category.id ? '#fff' : category.color}
      />
      <Text
        style={[
          styles.categoryText,
          {
            color: selectedId === category.id ? '#fff' : C.textPrimary,
          },
        ]}
      >
        {category.name}
      </Text>
    </TouchableOpacity>
  );

  // Dropdown layout
  if (layout === 'dropdown') {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}

        {/* Dropdown trigger */}
        <TouchableOpacity
          style={styles.dropdownTrigger}
          onPress={() => {
            lightTap();
            setDropdownOpen(true);
          }}
          activeOpacity={0.7}
        >
          <View style={styles.dropdownSelected}>
            {selectedCategory && (
              <View
                style={[
                  styles.dropdownIcon,
                  { backgroundColor: withAlpha(selectedCategory.color, 0.15) },
                ]}
              >
                <Feather
                  name={selectedCategory.icon as keyof typeof Feather.glyphMap}
                  size={18}
                  color={selectedCategory.color}
                />
              </View>
            )}
            <Text style={styles.dropdownText}>
              {selectedCategory?.name || 'Select category'}
            </Text>
          </View>
          <Feather name="chevron-down" size={20} color={C.textSecondary} />
        </TouchableOpacity>

        {/* Dropdown modal */}
        <Modal
          visible={dropdownOpen}
          transparent
          statusBarTranslucent
          animationType={dropdownAnimation}
          onRequestClose={() => setDropdownOpen(false)}
        >
          <TouchableOpacity
            style={styles.dropdownOverlay}
            activeOpacity={1}
            onPress={() => setDropdownOpen(false)}
          >
            <View style={styles.dropdownModal} onStartShouldSetResponder={() => true}>
              <View style={styles.dropdownHeader}>
                <Text style={styles.dropdownTitle}>
                  {label || 'Select Category'}
                </Text>
                <TouchableOpacity onPress={() => setDropdownOpen(false)}>
                  <Feather name="x" size={22} color={C.textPrimary} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={categories}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews
                windowSize={5}
                maxToRenderPerBatch={8}
                renderItem={renderDropdownItem}
                ListFooterComponent={
                  <TouchableOpacity
                    style={styles.dropdownFooter}
                    onPress={() => {
                      setDropdownAnimation('none');
                      setDropdownOpen(false);
                      setTimeout(() => {
                        setDropdownAnimation('fade');
                        if (onNavigateToSettings) {
                          onNavigateToSettings();
                        } else {
                          navigation.navigate('Settings', { scrollTo: 'categories' });
                        }
                      }, 50);
                    }}
                    activeOpacity={0.6}
                  >
                    <Feather name="settings" size={14} color={C.accent} />
                    <Text style={styles.dropdownFooterText}>Manage categories in Settings</Text>
                  </TouchableOpacity>
                }
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      {layout === 'horizontal' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {categories.map(renderCategoryButton)}
        </ScrollView>
      ) : (
        <View style={styles.gridContent}>
          {categories.map(renderCategoryButton)}
        </View>
      )}
      {settingsHint}
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
  },
  scrollContent: {
    gap: SPACING.sm,
    paddingHorizontal: 2,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    gap: SPACING.sm,
  },
  selectedCategory: {
    borderWidth: 2,
  },
  categoryText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  gridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  gridItem: {
    width: '48%',
  },

  // Dropdown styles
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  dropdownSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  dropdownIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  dropdownModal: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    maxHeight: '60%',
    borderWidth: 1,
    borderColor: C.border,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dropdownTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  dropdownItemIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownItemText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  // Settings hint
  settingsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingHorizontal: 2,
  },
  settingsHintText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  settingsHintLink: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  dropdownFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  dropdownFooterText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
  },
});

export default React.memo(CategoryPicker);
