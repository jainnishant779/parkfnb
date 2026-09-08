import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import PhotoGrid from '../../../components/wizard/PhotoGrid';
import { usePropertyWizard } from '../../../context/ListingWizardContext';

export default function StepPhotosScreen() {
  const navigation = useNavigation<any>();
  const { data, updateField, editPropertyId } = usePropertyWizard();

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <WizardHeader
        title={editPropertyId ? 'Edit Property' : 'Add Property'}
        step={2}
        totalSteps={2}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Property photos</Text>
        <Text style={styles.sub}>
          Add photos of the property exterior, entrance, and overall area. Individual parking
          space photos are added separately for each space.
        </Text>

        <PhotoGrid
          images={data.propertyImages}
          onChange={(imgs) => updateField('propertyImages', imgs)}
          maxCount={10}
        />

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
  content: { padding: 16, paddingBottom: 80 },
  h1: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  sub: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  optional: { fontSize: 12, color: '#9CA3AF', marginTop: 16, textAlign: 'center' },
});
