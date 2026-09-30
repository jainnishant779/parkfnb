import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import WizardHeader from '../../../components/wizard/WizardHeader';
import WizardFooter from '../../../components/wizard/WizardFooter';
import PhotoGrid from '../../../components/wizard/PhotoGrid';
import { useSpaceWizard } from '../../../context/ListingWizardContext';
import { palette, radii, fonts } from '../../../theme/kit';

export default function StepSpacePhotosScreen() {
  const navigation = useNavigation<any>();
  const { data, updateField } = useSpaceWizard();

  return (
    <View style={styles.screen}>
      <WizardHeader
        title={data.editSpaceId ? 'Edit Space' : 'Add Space'}
        step={2}
        totalSteps={5}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Space photos</Text>
        <Text style={styles.sub}>
          Show the specific parking spot — its markings, surface, and any distinctive features.
        </Text>
        <View style={styles.card}>
          <PhotoGrid
            images={data.spaceImages}
            onChange={(imgs) => updateField('spaceImages', imgs)}
            maxCount={10}
          />
        </View>
        <Text style={styles.optional}>Optional — you can add photos later.</Text>
      </ScrollView>
      <WizardFooter primaryLabel="Next" onPrimary={() => navigation.navigate('StepPricing')} />
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
