import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import PhotoGrid from '../../../components/wizard/PhotoGrid';
import { useSpaceWizard } from '../../../context/ListingWizardContext';

export default function StepSpacePhotosScreen() {
  const navigation = useNavigation<any>();
  const { data, updateField } = useSpaceWizard();

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <WizardHeader
        title={data.editSpaceId ? 'Edit Space' : 'Add Space'}
        step={2}
        totalSteps={5}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Space photos</Text>
        <Text style={styles.sub}>
          Show the specific parking spot — its markings, surface, and any distinctive features.
        </Text>
        <PhotoGrid
          images={data.spaceImages}
          onChange={(imgs) => updateField('spaceImages', imgs)}
          maxCount={10}
        />
        <Text style={styles.optional}>Optional — you can add photos later.</Text>
      </ScrollView>
      <WizardFooter primaryLabel="Next" onPrimary={() => navigation.navigate('StepPricing')} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 80 },
  h1: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  sub: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  optional: { fontSize: 12, color: '#9CA3AF', marginTop: 16, textAlign: 'center' },
});
