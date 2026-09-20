import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';

const SignUp = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSignUp = () => {
    console.log('Sign Up pressed');
    navigation.navigate('OTPVerification', { email });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Decorative Elements */}
          <View style={styles.decorativeTopRight}>
            <View style={styles.blobLarge} />
          </View>
          <View style={styles.decorativeTopLeft}>
            <View style={styles.blobSmall} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Sign Up</Text>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitleText}>Already here? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
                <Text style={styles.subtitleLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Form Container */}
          <View style={styles.formContainer}>
            {/* Name Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <View style={styles.inputIconContainer}>
                  <Icon name="user" size={18} color="#9CA3AF" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Your Name"
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <View style={styles.inputIconContainer}>
                  <Icon name="mail" size={18} color="#9CA3AF" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Email Id"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <View style={styles.inputIconContainer}>
                  <Icon name="lock" size={18} color="#9CA3AF" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Your Password"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Icon
                    name={showPassword ? 'eye' : 'eye-off'}
                    size={18}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign Up Button */}
            <TouchableOpacity
              style={styles.signUpButton}
              onPress={handleSignUp}
            >
              <Text style={styles.signUpButtonText}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Decorative */}
          <View style={styles.decorativeBottom}>
            <View style={styles.blobBottomLeft} />
            <View style={styles.blobBottomRight} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  decorativeTopRight: {
    position: 'absolute',
    top: -40,
    right: -40,
  },
  blobLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0D7377',
  },
  decorativeTopLeft: {
    position: 'absolute',
    top: 100,
    left: -20,
  },
  blobSmall: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E8F5F4',
  },
  header: {
    marginTop: 80,
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitleText: {
    fontSize: 14,
    color: '#6B7280',
  },
  subtitleLink: {
    fontSize: 14,
    color: '#0D7377',
    fontWeight: '600',
  },
  formContainer: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  inputIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 15,
    color: '#1A1A2E',
  },
  eyeButton: {
    padding: 8,
  },
  signUpButton: {
    backgroundColor: '#0D7377',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  signUpButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  decorativeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  blobBottomLeft: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5F4',
  },
  blobBottomRight: {
    position: 'absolute',
    bottom: 40,
    right: -20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0D7377',
  },
});

export default SignUp;
