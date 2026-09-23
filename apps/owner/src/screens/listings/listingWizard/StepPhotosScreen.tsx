import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import PhotoGrid from '../../../components/wizard/PhotoGrid';
import { usePropertyWizard } from '../../../context/ListingWizardContext';
import { palette, radii, fonts } from '../../../theme/kit';

export default function StepPhotosScreen() {
  const navigation = useNavigation<any>();
  const { data, updateField, editPropertyId } = usePropertyWizard();

  return (
    <View style={styles.screen}>
      <WizardHeader
        title={editPropertyId ? 'Edit Property' : 'Add Property'}
        step={2}
        totalSteps={2}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Property photos</Text>
        <Text style={styles.sub}>
          Add photos of the property exterior, entrance, and overall area. Individual parking
          space photos are added separately for each space.
        </Text>

        <View style={styles.card}>
          <PhotoGrid
            images={data.propertyImages}
            onChange={(imgs) => updateField('propertyImages', imgs)}
            maxCount={10}
          />
        </View>

        <Text style={styles.optional}>Photos are optional but recommended to attract renters.</Text>
      </ScrollView>
      <WizardFooter
        primaryLabel="Review"
        onPrimary={() => navigation.navigate('PropertyReview')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 16, paddingBottom: 80 },
  h1: { ...fonts.semibold, fontSize: 26, letterSpacing: -0.6, color: palette.text, marginBottom: 6 },
  sub: { ...fonts.medium, fontSize: 14.5, lineHeight: 20, color: palette.textMuted, marginBottom: 18 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 12,
  },
  optional: {
    ...fonts.medium,
    fontSize: 12.5,
    color: palette.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
});
