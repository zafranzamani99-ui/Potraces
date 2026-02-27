import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { CategoryOption } from '../../types';
import { lightTap } from '../../services/haptics';

interface CategoryPickerProps {
  categories: CategoryOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  label?: string;
  layout?: 'horizontal' | 'grid' | 'dropdown';
}

const CategoryPicker: React.FC<CategoryPickerProps> = ({
  categories,
  selectedId,
  onSelect,
  label,
  layout = 'horizontal',
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const selectedCategory = categories.find((c) => c.id === selectedId);

  const renderCategoryButton = (category: CategoryOption) => (
    <TouchableOpacity
      key={category.id}
      style={[
        styles.categoryButton,
        selectedId === category.id && styles.selectedCategory,
        {
          borderColor: category.color,
          backgroundColor:
            selectedId === category.id ? category.color : CALM.background,
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
            color: selectedId === category.id ? '#fff' : CALM.textPrimary,
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
          <Feather name="chevron-down" size={20} color={CALM.textSecondary} />
        </TouchableOpacity>

        {/* Dropdown modal */}
        <Modal
          visible={dropdownOpen}
          transparent
          animationType="fade"
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
                  <Feather name="x" size={22} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={categories}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
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
                }}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
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
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
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
    color: CALM.textPrimary,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  dropdownModal: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    maxHeight: '60%',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  dropdownTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
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
    color: CALM.textPrimary,
  },
});

export default CategoryPicker;
